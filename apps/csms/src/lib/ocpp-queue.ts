/** @file apps/csms/src/lib/ocpp-queue.ts. */
import { Worker, type Job } from 'bullmq';
import { createQueue, createRedisConnection } from '@edna/server-utils';
import { logger } from '../logger.js';
import { get } from './registry.js';

const COMMAND_CONCURRENCY = Number(process.env.OCPP_COMMAND_CONCURRENCY ?? 8);

export type OcppCommand =
  | {
      kind: 'RemoteStartTransaction';
      chargePointId: string;
      idTag: string;
      connectorId?: number;
      bookingId?: string;
    }
  | {
      kind: 'RemoteStopTransaction';
      chargePointId: string;
      transactionId: number;
      bookingId?: string;
      sessionId?: string;
    }
  | { kind: 'Reset'; chargePointId: string; type: 'Soft' | 'Hard' };

export type OcppCommandConsumer = {
  close: () => Promise<void>;
};

export function startCommandConsumer(redisUrl: string): OcppCommandConsumer {
  const connection = createRedisConnection(redisUrl);
  const bookings = createQueue('bookings', connection);
  const worker = new Worker<OcppCommand>(
    'ocpp-commands',
    async (job: Job<OcppCommand>) => {
      const cmd = job.data;
      const client = get(cmd.chargePointId);
      if (!client) {
        throw new Error(`No connected client for chargePointId=${cmd.chargePointId}`);
      }
      switch (cmd.kind) {
        case 'RemoteStartTransaction': {
          const res = (await client.call(
            'RemoteStartTransaction',
            { idTag: cmd.idTag, connectorId: cmd.connectorId ?? 1 },
            { callTimeoutMs: 30_000 },
          )) as { status?: string };
          if (res.status && res.status !== 'Accepted') {
            throw new Error(`RemoteStartTransaction ${res.status}`);
          }
          return res;
        }
        case 'RemoteStopTransaction': {
          return await client.call(
            'RemoteStopTransaction',
            { transactionId: cmd.transactionId },
            { callTimeoutMs: 30_000 },
          );
        }
        case 'Reset': {
          return await client.call('Reset', { type: cmd.type }, { callTimeoutMs: 30_000 });
        }
      }
    },
    { connection, concurrency: COMMAND_CONCURRENCY },
  );
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'ocpp command failed');
    if (
      job?.data.kind === 'RemoteStartTransaction' &&
      job.data.bookingId &&
      job.attemptsMade >= (job.opts.attempts ?? 1)
    ) {
      const { bookingId } = job.data;
      void bookings
        .add('remote_start_failed', {
          bookingId,
          reason: err.message,
        })
        .catch((enqueueErr) =>
          logger.error({ bookingId, enqueueErr }, 'failed to enqueue remote_start_failed'),
        );
    }
  });
  worker.on('error', (err) => logger.error({ err }, 'ocpp command worker error'));
  worker.on('completed', (job) =>
    logger.info({ jobId: job.id, kind: job.data.kind }, 'ocpp command completed'),
  );
  return {
    close: async () => {
      await worker.close();
      await bookings.close();
      await connection.quit();
    },
  };
}
