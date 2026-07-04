/** Shared Redis/BullMQ producer helpers for server-side packages. */
import { Queue, type JobsOptions } from 'bullmq';
import IORedis, { type RedisOptions } from 'ioredis';

export const DEFAULT_REDIS_URL = 'redis://localhost:6379';

export const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400, count: 100 },
} satisfies JobsOptions;

export function redisUrl(fallback = DEFAULT_REDIS_URL): string {
  return process.env.REDIS_URL ?? fallback;
}

export function createRedisConnection(
  url = redisUrl(),
  options: RedisOptions = {},
): IORedis {
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    ...options,
  });
}

export function createQueue<TData = unknown, TResult = unknown>(
  name: string,
  connection: IORedis,
): Queue<TData, TResult, string> {
  // Apply DEFAULT_JOB_OPTS (attempts: 5 + backoff + cleanup) as the queue-wide
  // default. Without this, jobs enqueued without explicit options — every
  // notification — got BullMQ's default attempts: 1 and were dropped on a single
  // transient failure (a DB blip permanently lost the in-app row + push).
  // Per-job options still override these.
  return new Queue<TData, TResult, string>(name, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });
}
