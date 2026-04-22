import Fastify from 'fastify';
import { loadEnv } from '@edna/config';
import { initSentry, Sentry } from './sentry.js';
import { logger } from './logger.js';

// ocpp-rpc import kept here to prove the dep loads at boot. Handlers land in Phase 5.
// Import proves the dep resolves at boot; handlers attach in Phase 5.
import * as ocppRpc from 'ocpp-rpc';
void ocppRpc;

async function main() {
  const env = loadEnv();
  initSentry();

  const app = Fastify({ logger: false });

  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'csms',
    uptimeSec: Math.round(process.uptime()),
  }));

  app.get('/_sentry-test', async () => {
    Sentry.captureException(new Error('sentry-smoke: csms'));
    await Sentry.flush(2000);
    return { fired: true };
  });

  const port = env.CSMS_PORT;
  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'csms listening (OCPP handlers attach in Phase 5)');
}

main().catch((err) => {
  logger.error({ err }, 'csms failed to start');
  process.exit(1);
});
