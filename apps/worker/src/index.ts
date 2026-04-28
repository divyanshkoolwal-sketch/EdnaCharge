import Fastify from 'fastify';
import IORedis from 'ioredis';
import { Worker, type Job } from 'bullmq';
import { loadEnv } from '@edna/config';
import { initSentry, Sentry } from './sentry.js';
import { logger } from './logger.js';
import { autoDeclineById } from './jobs/auto-decline.js';
import { settleSessionById } from './jobs/settle-session.js';
import { notify, type NotificationJob } from './jobs/notifications.js';

// AUDIT L2: discriminated union over BullMQ job payloads per queue so the
// processor body is strongly typed.
type AutoDeclinePayload = { bookingId: string };
type SettleSessionPayload = { sessionId: string };
type SettleByTxIdPayload = { transactionId: number; meterStop?: number; timestamp?: string };
type BookingsPayload = AutoDeclinePayload | SettleSessionPayload | SettleByTxIdPayload;
type BookingsName = 'auto_decline' | 'settle_session' | 'settle_session_by_txid';

type NotifyPayload = NotificationJob['data'];
type NotifyName = NotificationJob['name'];

function hasStringProp<T extends string>(
  payload: BookingsPayload,
  prop: T,
): payload is BookingsPayload & Record<T, string> {
  return prop in payload && typeof payload[prop as keyof BookingsPayload] === 'string';
}

function hasNumberProp<T extends string>(
  payload: BookingsPayload,
  prop: T,
): payload is BookingsPayload & Record<T, number> {
  return prop in payload && typeof payload[prop as keyof BookingsPayload] === 'number';
}

function isSettleByTxIdPayload(payload: BookingsPayload): payload is SettleByTxIdPayload {
  return hasNumberProp(payload, 'transactionId');
}

async function main() {
  const env = loadEnv();
  initSentry();

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (err) => logger.error({ err }, 'redis connection error'));

  const workers = [
    new Worker<BookingsPayload, void, BookingsName>(
      'bookings',
      async (job: Job<BookingsPayload, void, BookingsName>) => {
        if (job.name === 'auto_decline') {
          if (!hasStringProp(job.data, 'bookingId')) {
            logger.warn({ jobId: job.id }, 'auto_decline: invalid payload');
            return;
          }
          return autoDeclineById(job.data.bookingId);
        }
        if (job.name === 'settle_session') {
          if (!hasStringProp(job.data, 'sessionId')) {
            logger.warn({ jobId: job.id }, 'settle_session: invalid payload');
            return;
          }
          return settleSessionById(job.data.sessionId);
        }
        if (job.name === 'settle_session_by_txid') {
          // Deferred settle — reconciler for the H3 late-StartTransaction path.
          // For now, re-look up by ocppTransactionId and settle via the normal
          // settleSession if found; otherwise drop with a warning.
          if (!isSettleByTxIdPayload(job.data)) {
            logger.warn({ jobId: job.id }, 'settle_session_by_txid: invalid payload');
            return;
          }
          const data = job.data;
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
            const kwh = data.meterStop != null ? (data.meterStop - session.meterStartWh) / 1000 : 0;
            await prisma.chargingSession.update({
              where: { id: session.id },
              data: {
                endedAt: data.timestamp ? new Date(data.timestamp) : new Date(),
                meterStopWh: data.meterStop ?? null,
                finalKwh: kwh,
              },
            });
          }
          return settleSessionById(session.id);
        }
        logger.warn({ name: job.name }, 'bookings queue: unknown job name');
      },
      { connection },
    ),
    new Worker<NotifyPayload, void, NotifyName>('notifications', async (job) => notify(job), {
      connection,
    }),
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
