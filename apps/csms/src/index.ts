import Fastify from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { RPCServer } from 'ocpp-rpc';
import bcrypt from 'bcryptjs';
import { loadEnv } from '@edna/config';
import { prisma } from '@edna/db';
import { initSentry, Sentry } from './sentry.js';
import { logger } from './logger.js';
import { bindHandlers, type Client } from './handlers/index.js';
import { register, unregister, size } from './lib/registry.js';
import { startCommandConsumer } from './lib/ocpp-queue.js';

// In-memory per-IP throttle for the OCPP auth handshake. bcrypt.compare is
// deliberately expensive, so unbounded connection attempts are both a
// credential brute-force vector and a CPU-exhaustion (DoS) vector. Track recent
// failures per IP and fast-reject once a threshold is exceeded within the
// window — before running bcrypt. CSMS is single-instance (in-memory registry;
// see below), so in-process state is authoritative.
const AUTH_FAIL_WINDOW_MS = 5 * 60 * 1000;
const AUTH_FAIL_MAX = 10;
const authFailures = new Map<string, number[]>();

function recentFailures(ip: string): number[] {
  const now = Date.now();
  const hits = (authFailures.get(ip) ?? []).filter((t) => now - t < AUTH_FAIL_WINDOW_MS);
  if (hits.length) authFailures.set(ip, hits);
  else authFailures.delete(ip);
  return hits;
}

async function main() {
  const env = loadEnv();
  initSentry();

  // Cap OCPP frame size. Real OCPP 1.6 messages are small (a fat MeterValues is
  // a few KB); 128 KB is generous headroom while stopping a compromised/hostile
  // charger from exhausting memory with giant frames.
  const rpc = new RPCServer({
    protocols: ['ocpp1.6'],
    strictMode: true,
    wssOptions: { maxPayload: 128 * 1024 },
  });

  rpc.auth(async (accept, reject, handshake) => {
    const cpId = handshake.identity;
    const ip =
      (handshake as { remoteAddress?: string }).remoteAddress ??
      (handshake as { request?: { socket?: { remoteAddress?: string } } }).request?.socket
        ?.remoteAddress ??
      'unknown';

    if (recentFailures(ip).length >= AUTH_FAIL_MAX) {
      logger.warn({ ip, cpId }, 'auth throttled: too many recent failures');
      return reject(429, 'Too many attempts');
    }

    const fail = (code: number, msg: string) => {
      const hits = recentFailures(ip);
      hits.push(Date.now());
      authFailures.set(ip, hits);
      return reject(code, msg);
    };

    const charger = await prisma.charger.findUnique({ where: { ocppChargePointId: cpId } });
    if (!charger || !charger.ocppAuthHash) return fail(401, 'Unknown charger');
    const auth = handshake.password?.toString('utf8') ?? '';
    const ok = await bcrypt.compare(auth, charger.ocppAuthHash);
    if (!ok) return fail(401, 'Bad credentials');
    // Success: clear this IP's failure history.
    authFailures.delete(ip);
    accept({ cpId });
  });

  // Bound memory: periodically evict IPs whose failure window has fully aged
  // out. unref so this timer never keeps the process alive on shutdown.
  setInterval(() => {
    for (const ip of authFailures.keys()) recentFailures(ip);
  }, AUTH_FAIL_WINDOW_MS).unref();

  rpc.on('client', (client: Client) => {
    const cpId = (client.session as { cpId?: string }).cpId ?? client.identity;
    if (!cpId) {
      client.close(4000, 'No identity');
      return;
    }
    logger.info({ cpId, connected: size() + 1 }, 'client connected');
    register(cpId, client);
    bindHandlers(client, { chargePointId: cpId });
    // Persist connection state so the API (a separate service) can show the
    // host a live "charger connected" indicator. Best-effort — a DB blip must
    // never tear down a live OCPP session.
    prisma.charger
      .updateMany({ where: { ocppChargePointId: cpId }, data: { ocppConnectedAt: new Date() } })
      .catch((err) => {
        logger.warn({ cpId, err }, 'failed to stamp ocppConnectedAt');
        Sentry.captureException(err);
      });
    client.on('close', () => {
      unregister(cpId);
      prisma.charger
        .updateMany({ where: { ocppChargePointId: cpId }, data: { ocppConnectedAt: null } })
        .catch((err) => {
          logger.warn({ cpId, err }, 'failed to clear ocppConnectedAt');
          Sentry.captureException(err);
        });
      logger.info({ cpId, connected: size() }, 'client disconnected');
    });
    client.on('protocolError', (err: unknown) => {
      logger.warn({ cpId, err }, 'protocol error');
      Sentry.captureException(err);
    });
  });

  const app = Fastify({ logger: false });
  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'csms',
    uptimeSec: Math.round(process.uptime()),
    clients: size(),
  }));
  app.get('/_sentry-test', async () => {
    Sentry.captureException(new Error('sentry-smoke: csms'));
    await Sentry.flush(2000);
    return { fired: true };
  });
  await app.ready();

  app.server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    if (!req.url?.startsWith('/ocpp/v1.6/')) {
      socket.destroy();
      return;
    }
    rpc.handleUpgrade(req, socket, head);
  });

  // Render injects $PORT (single port serves both the HTTP healthz and the
  // OCPP websocket upgrade); fall back to the configured port locally.
  const port = Number(process.env.PORT) || env.CSMS_PORT;
  await app.listen({ port, host: '0.0.0.0' });
  logger.info(
    { port, singleInstance: true },
    'csms listening (OCPP + HTTP) — single-instance only (in-memory registry); do not horizontally scale (see lib/registry.ts)',
  );

  startCommandConsumer(env.REDIS_URL);
  logger.info('ocpp-commands consumer started');

  const shutdown = async () => {
    await (rpc as RPCServer & { close: (opts: { code: number }) => Promise<void> }).close({
      code: 1001,
    });
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'csms failed to start');
  process.exit(1);
});
