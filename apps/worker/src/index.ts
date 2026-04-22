import Fastify from 'fastify';
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { loadEnv } from '@edna/config';
import { initSentry, Sentry } from './sentry.js';
import { logger } from './logger.js';

async function main() {
  const env = loadEnv();
  initSentry();

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (err) => logger.error({ err }, 'redis connection error'));

  // Phase 0: scaffold queues that real jobs attach to later. Keeping them wired now
  // makes Phase 5–8 additive, not structural.
  const queues = {
    ocppCommands: new Queue('ocpp-commands', { connection }),
    bookings: new Queue('bookings', { connection }),
    notifications: new Queue('notifications', { connection }),
  };

  const noopWorker = new Worker(
    'noop',
    async (job) => {
      logger.info({ jobId: job.id, name: job.name }, 'noop worker processed');
    },
    { connection },
  );
  noopWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'noop worker failed');
    Sentry.captureException(err);
  });

  const app = Fastify({ logger: false });
  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'worker',
    uptimeSec: Math.round(process.uptime()),
    queues: Object.keys(queues),
  }));
  app.get('/_sentry-test', async () => {
    Sentry.captureException(new Error('sentry-smoke: worker'));
    await Sentry.flush(2000);
    return { fired: true };
  });

  await app.listen({ port: env.WORKER_PORT, host: '0.0.0.0' });
  logger.info({ port: env.WORKER_PORT }, 'worker listening');
}

main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
