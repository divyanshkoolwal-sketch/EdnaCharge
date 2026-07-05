/** @file apps/worker/src/index.ts. */
import Fastify from 'fastify';
import { Worker, type Job } from 'bullmq';
import { loadEnv } from '@edna/config';
import { createRedisConnection, initServiceSentry, Sentry } from '@edna/server-utils';
import { logger } from './logger.js';
import { autoDeclineById } from './jobs/auto-decline.js';
import { settleSessionById } from './jobs/settle-session.js';
import {
  handleRemoteStartFailed,
  type RemoteStartFailedPayload,
} from './jobs/remote-start-failed.js';
import { notify, type NotificationJob } from './jobs/notifications.js';
import { sweepOrphanedSessions } from './jobs/orphan-sweep.js';
import { cancelHold, type CancelHoldPayload } from './jobs/cancel-hold.js';
import { bookingsQueue, closeQueues, notificationsQueue } from './lib/queues.js';

// AUDIT L2: discriminated union over BullMQ job payloads per queue.
type AutoDeclinePayload = { bookingId: string };
type SettleSessionPayload = { sessionId: string };
type SettleByTxIdPayload = {
  transactionId: number;
  meterStop?: number;
  timestamp?: string;
  // The charge point that reported the stop. Used to verify the deferred stop
  // came from the charger that actually owns the session (matches the CSMS
  // ingress-time binding for the non-deferred path).
  chargePointId?: string;
};

type OrphanSweepPayload = Record<string, never>;

type BookingsPayload =
  | AutoDeclinePayload
  | SettleSessionPayload
  | SettleByTxIdPayload
  | RemoteStartFailedPayload
  | OrphanSweepPayload
  | CancelHoldPayload;

type BookingsName =
  | 'auto_decline'
  | 'settle_session'
  | 'settle_session_by_txid'
  | 'remote_start_failed'
  | 'orphan_sweep'
  | 'cancel_hold';

type NotifyPayload = NotificationJob['data'];
type NotifyName = NotificationJob['name'];

function hasStringProp<T extends string>(
  payload: BookingsPayload,
  prop: T,
): payload is BookingsPayload & Record<T, string> {
  return prop in payload && typeof (payload as Record<string, unknown>)[prop] === 'string';
}

function hasNumberProp<T extends string>(
  payload: BookingsPayload,
  prop: T,
): payload is BookingsPayload & Record<T, number> {
  return prop in payload && typeof (payload as Record<string, unknown>)[prop] === 'number';
}

function isSettleByTxIdPayload(payload: BookingsPayload): payload is SettleByTxIdPayload {
  return hasNumberProp(payload, 'transactionId');
}

async function main() {
  const env = loadEnv();
  // Fail fast: the worker captures / cancels / settles real payments (settle_session,
  // cancel_hold, auto_decline), so a prod boot without the Stripe secret would run
  // "healthy" while silently completing bookings with no money movement.
  if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY) {
    throw new Error('Refusing to boot: STRIPE_SECRET_KEY is required in production for the worker.');
  }
  initServiceSentry('worker', 'SENTRY_DSN_WORKER', logger);

  const connection = createRedisConnection(env.REDIS_URL);
  connection.on('error', (err) => logger.error({ err }, 'redis connection error'));

  const workers = [
    new Worker<BookingsPayload, void, BookingsName>(
      'bookings',
      async (job: Job<BookingsPayload, void, BookingsName>) => {
        switch (job.name) {
          case 'auto_decline':
            if (!hasStringProp(job.data, 'bookingId')) {
              logger.warn({ jobId: job.id }, 'auto_decline: invalid payload');
              return;
            }
            return autoDeclineById((job.data as AutoDeclinePayload).bookingId);

          case 'settle_session':
            if (!hasStringProp(job.data, 'sessionId')) {
              logger.warn({ jobId: job.id }, 'settle_session: invalid payload');
              return;
            }
            return settleSessionById((job.data as SettleSessionPayload).sessionId);

          case 'settle_session_by_txid': {
            if (!isSettleByTxIdPayload(job.data)) {
              logger.warn({ jobId: job.id }, 'settle_session_by_txid: invalid payload');
              return;
            }
            const data = job.data;
            const { prisma } = await import('@edna/db');
            const session = await prisma.chargingSession.findUnique({
              where: { ocppTransactionId: data.transactionId },
              include: { booking: true, charger: true },
            });
            if (!session) {
              logger.warn(
                { transactionId: data.transactionId },
                'settle_session_by_txid: no session; giving up',
              );
              return;
            }
            // SECURITY: only settle if the deferred stop came from the charger
            // that owns the session. Prevents one charger from finalizing (and
            // mis-metering) another charger's session via a guessed txId.
            if (data.chargePointId) {
              const charger = await prisma.charger.findUnique({
                where: { ocppChargePointId: data.chargePointId },
                select: { id: true },
              });
              if (!charger || charger.id !== session.chargerId) {
                logger.warn(
                  {
                    transactionId: data.transactionId,
                    chargePointId: data.chargePointId,
                    sessionChargerId: session.chargerId,
                  },
                  'settle_session_by_txid: charge point does not own this session; refusing',
                );
                return;
              }
            }
            if (!session.endedAt) {
              const kwh =
                data.meterStop != null
                  ? Math.max(0, (data.meterStop - session.meterStartWh) / 1000)
                  : 0;
              // ATOMIC end-stamp guard — a duplicate deferred delivery would
              // otherwise both pass the !endedAt check and double-stamp +
              // double-notify session_stopped. Only the winner (count === 1)
              // stamps and notifies; settleSessionById below is idempotent.
              const ended = await prisma.chargingSession.updateMany({
                where: { id: session.id, endedAt: null },
                data: {
                  endedAt: data.timestamp ? new Date(data.timestamp) : new Date(),
                  meterStopWh: data.meterStop ?? null,
                  finalKwh: kwh,
                },
              });
              if (ended.count === 1) {
                await notificationsQueue().add(
                  'session_stopped',
                  {
                    driverId: session.booking.driverId,
                    hostId: session.charger.hostId,
                    sessionId: session.id,
                  },
                  { jobId: `session_stopped:${session.id}` },
                );
              }
            }
            return settleSessionById(session.id);
          }

          case 'remote_start_failed':
            if (!hasStringProp(job.data, 'bookingId')) {
              logger.warn({ jobId: job.id }, 'remote_start_failed: invalid payload');
              return;
            }
            return handleRemoteStartFailed(job.data as RemoteStartFailedPayload);

          case 'orphan_sweep':
            return sweepOrphanedSessions();

          case 'cancel_hold':
            if (!hasStringProp(job.data, 'paymentIntentId')) {
              logger.warn({ jobId: job.id }, 'cancel_hold: invalid payload');
              return;
            }
            return cancelHold(job.data as CancelHoldPayload);

          default:
            logger.warn({ name: job.name }, 'bookings queue: unknown job name');
        }
      },
      { connection },
    ),
    new Worker<NotifyPayload, void, NotifyName>('notifications', async (job) => notify(job), {
      connection,
    }),
  ];

  // Repeatable watchdog: finalize charging sessions abandoned by a charger that
  // dropped its websocket before StopTransaction, so pre-auth holds don't leak.
  const ORPHAN_SWEEP_INTERVAL_MS = Number(process.env.ORPHAN_SWEEP_INTERVAL_MS ?? 5 * 60_000);
  await bookingsQueue().add(
    'orphan_sweep',
    {},
    { repeat: { every: ORPHAN_SWEEP_INTERVAL_MS }, removeOnComplete: true, removeOnFail: 100 },
  );
  logger.info({ everyMs: ORPHAN_SWEEP_INTERVAL_MS }, 'orphan-sweep watchdog scheduled');

  for (const w of workers) {
    w.on('failed', (job, err) => {
      logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed');
      Sentry.captureException(err);
    });
    w.on('error', (err) => {
      logger.error({ queue: w.name, err }, 'worker error');
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
  app.get('/readyz', async (_req, reply) => {
    try {
      await connection.ping();
      return {
        status: 'ok' as const,
        service: 'worker',
        dependencies: { redis: 'ok' as const },
        queues: workers.map((w) => w.name),
      };
    } catch (err) {
      logger.error({ err }, 'worker readiness check failed');
      return reply.code(503).send({
        status: 'error' as const,
        service: 'worker',
        dependencies: { redis: 'error' as const },
        queues: workers.map((w) => w.name),
      });
    }
  });
  if (process.env.NODE_ENV !== 'production') {
    app.get('/_sentry-test', async () => {
      Sentry.captureException(new Error('sentry-smoke: worker'));
      await Sentry.flush(2000);
      return { fired: true, dsnConfigured: !!process.env.SENTRY_DSN_WORKER };
    });
  }
  await app.listen({ port: env.WORKER_PORT, host: '0.0.0.0' });
  logger.info({ port: env.WORKER_PORT }, 'worker listening');

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('worker shutting down');
    await Promise.allSettled(workers.map((w) => w.close()));
    await Promise.allSettled([app.close(), closeQueues(), connection.quit()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
