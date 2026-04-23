import Fastify from 'fastify';
import { RPCServer } from 'ocpp-rpc';
import bcrypt from 'bcryptjs';
import { loadEnv } from '@edna/config';
import { prisma } from '@edna/db';
import { initSentry, Sentry } from './sentry.js';
import { logger } from './logger.js';
import { bindHandlers } from './handlers/index.js';
import { register, unregister, size } from './lib/registry.js';
import { startCommandConsumer } from './lib/ocpp-queue.js';

async function main() {
  const env = loadEnv();
  initSentry();

  const rpc = new RPCServer({ protocols: ['ocpp1.6'], strictMode: true });

  rpc.auth(async (accept, reject, handshake) => {
    const cpId = handshake.identity;
    const charger = await prisma.charger.findUnique({ where: { ocppChargePointId: cpId } });
    if (!charger || !charger.ocppAuthHash) return reject(401, 'Unknown charger');
    const auth = handshake.password?.toString('utf8') ?? '';
    const ok = await bcrypt.compare(auth, charger.ocppAuthHash);
    if (!ok) return reject(401, 'Bad credentials');
    accept({ cpId });
  });

  rpc.on('client', (client: any) => {
    const cpId = (client.session as { cpId?: string }).cpId ?? client.identity;
    if (!cpId) {
      client.close(4000, 'No identity');
      return;
    }
    logger.info({ cpId, connected: size() + 1 }, 'client connected');
    register(cpId, client);
    bindHandlers(client, { chargePointId: cpId });
    client.on('close', () => {
      unregister(cpId);
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

  app.server.on('upgrade', (req: any, socket: any, head: any) => {
    if (!req.url?.startsWith('/ocpp/v1.6/')) {
      socket.destroy();
      return;
    }
    rpc.handleUpgrade(req, socket, head);
  });

  await app.listen({ port: env.CSMS_PORT, host: '0.0.0.0' });
  logger.info({ port: env.CSMS_PORT }, 'csms listening (OCPP + HTTP)');

  startCommandConsumer(env.REDIS_URL);
  logger.info('ocpp-commands consumer started');

  const shutdown = async () => {
    await (rpc as any).close({ code: 1001 });
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
