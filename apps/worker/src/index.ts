import Fastify from 'fastify';
import IORedis from 'ioredis';
import { Worker, type Job } from 'bullmq';
import { loadEnv } from '@edna/config';
import { initSentry, Sentry } from './sentry.js';
import { logger } from './logger.js';
import { autoDeclineById } from './jobs/auto-decline.js';
import { settleSessionById } from './jobs/settle-session.js';
import { notify, type NotificationJob } from './jobs/notifications.js';
import {
  handleShellyStart,
  handleShellyStop,
  handleShellyMeterPoll,
  type ShellyStartPayload,
  type ShellyStopPayload,
  type ShellyMeterPollPayload,
} from './jobs/shelly-command.js';
import { handleDeviceMonitor, type DeviceMonitorPayload } from './jobs/device-monitor.js';

// AUDIT L2: discriminated union over BullMQ job payloads per queue.
type AutoDeclinePayload = { bookingId: string };
type SettleSessionPayload = { sessionId: string };
type SettleByTxIdPayload = { transactionId: number; meterStop?: number; timestamp?: string };

type BookingsPayload =
  | AutoDeclinePayload
  | SettleSessionPayload
  | SettleByTxIdPayload
  | ShellyStartPayload
  | ShellyStopPayload
  | ShellyMeterPollPayload
  | DeviceMonitorPayload;

type BookingsName =
  | 'auto_decline'
  | 'settle_session'
  | 'settle_session_by_txid'
  | 'shelly_start'
  | 'shelly_stop'
  | 'shelly_meter_poll'
  | 'device_monitor';

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
  initSentry();

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
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
            });
            if (!session) {
              logger.warn({ transactionId: data.transactionId }, 'settle_session_by_txid: no session; giving up');
              return;
            }
            if (!session.endedAt) {
              const kwh = data.meterStop != null ? Math.max(0, (data.meterStop - session.meterStartWh) / 1000) : 0;
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

          case 'shelly_start':
            return handleShellyStart(job as Job<ShellyStartPayload>);

          case 'shelly_stop':
            return handleShellyStop(job as Job<ShellyStopPayload>);

          case 'shelly_meter_poll':
            return handleShellyMeterPoll(job as Job<ShellyMeterPollPayload>);

          case 'device_monitor':
            return handleDeviceMonitor(job as Job<DeviceMonitorPayload>);

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
