/** @file apps/csms/src/index.ts. */
import Fastify from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { RPCServer } from 'ocpp-rpc';
import bcrypt from 'bcryptjs';
import { loadEnv } from '@edna/config';
import { prisma } from '@edna/db';
import { initServiceSentry, Sentry, registerRequestId, registerMetrics } from '@edna/server-utils';
import { logger } from './logger.js';
import { bindHandlers, type Client } from './handlers/index.js';
import { closeQueues as closeHandlerQueues } from './handlers/queues.js';
import { get, register, unregister, size } from './lib/registry.js';
import { startCommandConsumer } from './lib/ocpp-queue.js';

// In-memory per-IP throttle for the OCPP auth handshake. bcrypt.compare is
// deliberately expensive, so unbounded connection attempts are both a
// credential brute-force vector and a CPU-exhaustion (DoS) vector. Track recent
// failures per IP and fast-reject once a threshold is exceeded within the
// window — before running bcrypt. CSMS is single-instance (in-memory registry;
// see below), so in-process state is authoritative.
const AUTH_FAIL_WINDOW_MS = 5 * 60 * 1000;
const AUTH_FAIL_MAX = 10;
// Once a charge point is over the failure threshold, cap bcrypt to one every
// BCRYPT_THROTTLE_MS so a flood against a (publicly derivable) cpId can't force
// unbounded hashing. A legitimate charger still gets a bcrypt slot within this
// window, so it's never indefinitely locked out — just briefly delayed.
const BCRYPT_THROTTLE_MS = 30 * 1000;
const authFailures = new Map<string, number[]>();
const lastBcryptAt = new Map<string, number>();

function recentFailures(ip: string): number[] {
  const now = Date.now();
  const hits = (authFailures.get(ip) ?? []).filter((t) => now - t < AUTH_FAIL_WINDOW_MS);
  if (hits.length) authFailures.set(ip, hits);
  else {
    authFailures.delete(ip);
    lastBcryptAt.delete(ip);
  }
  return hits;
}

async function main() {
  const env = loadEnv();
  initServiceSentry('csms', 'SENTRY_DSN_CSMS', logger);

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
    // Keyed per charge point (behind Render's proxy every charger shares one
    // source IP, so IP keying would cross-lock chargers).
    const throttleKey = cpId ? `cp:${cpId}` : `ip:${ip}`;

    const now = Date.now();
    const priorFails = recentFailures(throttleKey);
    // Under sustained failures, cap bcrypt to one per BCRYPT_THROTTLE_MS for this
    // charge point — bounds hashing work from a flood on a derivable cpId while
    // still giving a legit charger a slot within the window (never a hard lock).
    if (
      priorFails.length >= AUTH_FAIL_MAX &&
      now - (lastBcryptAt.get(throttleKey) ?? 0) < BCRYPT_THROTTLE_MS
    ) {
      logger.warn({ ip, cpId, fails: priorFails.length }, 'ocpp auth: bcrypt throttled');
      return reject(429, 'Too many attempts');
    }

    const recordFail = (): number => {
      const hits = recentFailures(throttleKey);
      hits.push(Date.now());
      authFailures.set(throttleKey, hits);
      return hits.length;
    };

    try {
      const charger = cpId
        ? await prisma.charger.findUnique({ where: { ocppChargePointId: cpId } })
        : null;
      const password = handshake.password?.toString('utf8') ?? '';
      // Skip bcrypt for unknown charger / empty password so garbage floods never
      // cost a hash at all.
      if (!charger?.ocppAuthHash || password.length === 0) {
        const fails = recordFail();
        return reject(fails >= AUTH_FAIL_MAX ? 429 : 401, 'Bad credentials');
      }

      // CHECK CREDENTIALS. A charge point with the RIGHT secret is ALWAYS admitted
      // (the throttle above only gates the RATE of hashing, never the outcome), so
      // a flood on a derivable cpId can delay but never lock out the real charger.
      lastBcryptAt.set(throttleKey, now);
      const ok = await bcrypt.compare(password, charger.ocppAuthHash);
      if (ok) {
        authFailures.delete(throttleKey);
        lastBcryptAt.delete(throttleKey);
        accept({ cpId });
        return;
      }
      const fails = recordFail();
      logger.warn({ ip, cpId, fails }, 'ocpp auth failed');
      return reject(fails >= AUTH_FAIL_MAX ? 429 : 401, 'Bad credentials');
    } catch (err) {
      logger.error({ err, cpId }, 'auth failed while checking charger credentials');
      Sentry.captureException(err);
      return reject(500, 'Auth temporarily unavailable');
    }
  });

  // Bound memory: periodically evict throttle keys whose failure window has fully
  // aged out (recentFailures deletes empty entries + their lastBcryptAt). Also
  // drop any orphaned lastBcryptAt (e.g. bcrypt threw before a failure recorded).
  // unref so this timer never keeps the process alive on shutdown.
  setInterval(() => {
    for (const key of authFailures.keys()) recentFailures(key);
    const bcryptCutoff = Date.now() - AUTH_FAIL_WINDOW_MS;
    for (const [key, at] of lastBcryptAt) {
      if (at < bcryptCutoff && !authFailures.has(key)) lastBcryptAt.delete(key);
    }
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
      if (get(cpId) !== client) {
        logger.info({ cpId, connected: size() }, 'stale client disconnected');
        return;
      }
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
  registerRequestId(app, logger);
  registerMetrics(app, 'csms');
  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'csms',
    uptimeSec: Math.round(process.uptime()),
    clients: size(),
  }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok' as const,
        service: 'csms',
        dependencies: { database: 'ok' as const },
        clients: size(),
      };
    } catch (err) {
      logger.error({ err }, 'csms readiness check failed');
      return reply.code(503).send({
        status: 'error' as const,
        service: 'csms',
        dependencies: { database: 'error' as const },
        clients: size(),
      });
    }
  });
  if (process.env.NODE_ENV !== 'production') {
    app.get('/_sentry-test', async () => {
      Sentry.captureException(new Error('sentry-smoke: csms'));
      await Sentry.flush(2000);
      return { fired: true, dsnConfigured: !!process.env.SENTRY_DSN_CSMS };
    });
  }
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

  const commandWorker = startCommandConsumer(env.REDIS_URL);
  logger.info('ocpp-commands consumer started');

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await (rpc as RPCServer & { close: (opts: { code: number }) => Promise<void> }).close({
      code: 1001,
    });
    await commandWorker.close();
    await closeHandlerQueues();
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
