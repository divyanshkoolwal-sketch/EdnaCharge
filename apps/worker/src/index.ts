import Fastify from 'fastify';
import IORedis from 'ioredis';
import { Worker } from 'bullmq';
import { loadEnv } from '@edna/config';
import { initSentry, Sentry } from './sentry.js';
import { logger } from './logger.js';
import { autoDecline } from './jobs/auto-decline.js';
import { settleSession } from './jobs/settle-session.js';
import { notify } from './jobs/notifications.js';

async function main() {
  const env = loadEnv();
  initSentry();

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (err) => logger.error({ err }, 'redis connection error'));

  const workers = [
    new Worker(
      'bookings',
      async (job) => {
        if (job.name === 'auto_decline') return autoDecline(job as any);
        if (job.name === 'settle_session') return settleSession(job as any);
      },
      { connection },
    ),
    new Worker('notifications', async (job) => notify(job as any), { connection }),
  ];

  for (const w of workers) {
    w.on('failed', (job, err) => {
      logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed');
      Sentry.captureException(err);
    });
  }

  const app = Fastify({ logger: false });
  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'worker',
    uptimeSec: Math.round(process.uptime()),
    queues: workers.map((w) => w.name),
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
