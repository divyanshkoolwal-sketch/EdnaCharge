import Fastify from 'fastify';
import IORedis from 'ioredis';
import { Worker, type Job } from 'bullmq';
import { loadEnv } from '@edna/config';
import { initSentry, Sentry } from './sentry.js';
import { logger } from './logger.js';
import { autoDecline } from './jobs/auto-decline.js';
import { settleSession } from './jobs/settle-session.js';
import { notify } from './jobs/notifications.js';

// AUDIT L2: discriminated union over BullMQ job payloads per queue so the
// processor body is strongly typed and no `as any` is needed.
type BookingsJob =
  | { name: 'auto_decline'; data: { bookingId: string } }
  | { name: 'settle_session'; data: { sessionId: string } }
  | {
      name: 'settle_session_by_txid';
      data: { transactionId: number; meterStop?: number; timestamp?: string };
    };

type NotifyJob = Parameters<typeof notify>[0];
type NotifyPayload = NotifyJob extends Job<infer D> ? D : never;

async function main() {
  const env = loadEnv();
  initSentry();

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (err) => logger.error({ err }, 'redis connection error'));

  const workers = [
    new Worker<BookingsJob['data']>(
      'bookings',
      async (job: Job<BookingsJob['data']>) => {
        if (job.name === 'auto_decline') {
          return autoDecline(job as Job<{ bookingId: string }>);
        }
        if (job.name === 'settle_session') {
          return settleSession(job as Job<{ sessionId: string }>);
        }
        if (job.name === 'settle_session_by_txid') {
          // Deferred settle — reconciler for the H3 late-StartTransaction path.
          // For now, re-look up by ocppTransactionId and settle via the normal
          // settleSession if found; otherwise drop with a warning.
          const data = job.data as {
            transactionId: number;
            meterStop?: number;
            timestamp?: string;
          };
          const { prisma } = await import('@edna/db');
          const session = await prisma.chargingSession.findUnique({
            where: { ocppTransactionId: data.transactionId },
          });
          if (!session) {
            logger.warn(
              { transactionId: data.transactionId },
              'settle_session_by_txid: still no session; giving up',
            );
            return;
          }
          if (!session.endedAt) {
            const kwh =
              data.meterStop != null ? (data.meterStop - session.meterStartWh) / 1000 : 0;
            await prisma.chargingSession.update({
              where: { id: session.id },
              data: {
                endedAt: data.timestamp ? new Date(data.timestamp) : new Date(),
                meterStopWh: data.meterStop ?? null,
                finalKwh: kwh,
              },
            });
          }
          return settleSession({
            ...job,
            data: { sessionId: session.id },
          } as unknown as Job<{ sessionId: string }>);
        }
        logger.warn({ name: job.name }, 'bookings queue: unknown job name');
      },
      { connection },
    ),
    new Worker<NotifyPayload>(
      'notifications',
      async (job) => notify(job as NotifyJob),
      { connection },
    ),
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
