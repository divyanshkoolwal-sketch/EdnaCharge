import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../logger.js';
import { get } from './registry.js';

export type OcppCommand =
  | { kind: 'RemoteStartTransaction'; chargePointId: string; idTag: string; connectorId?: number }
  | { kind: 'RemoteStopTransaction'; chargePointId: string; transactionId: number }
  | { kind: 'Reset'; chargePointId: string; type: 'Soft' | 'Hard' };

export function startCommandConsumer(redisUrl: string): Worker<OcppCommand> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
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
          const res = await client.call(
            'RemoteStartTransaction',
            { idTag: cmd.idTag, connectorId: cmd.connectorId ?? 1 },
            { callTimeoutMs: 30_000 },
          );
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
    { connection },
  );
  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err }, 'ocpp command failed'),
  );
  worker.on('completed', (job) =>
    logger.info({ jobId: job.id, kind: job.data.kind }, 'ocpp command completed'),
  );
  return worker;
}
