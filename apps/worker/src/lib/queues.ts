/**
 * Singleton BullMQ Queue + IORedis connection. Worker jobs need to enqueue
 * follow-up jobs (e.g., next meter poll, settle_session); without this each
 * call would create + leak a fresh Redis connection.
 */

import IORedis from 'ioredis';
import { Queue } from 'bullmq';

let _connection: IORedis | null = null;
let _bookingsQueue: Queue | null = null;

function connection(): IORedis {
  if (_connection) return _connection;
  _connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  return _connection;
}

export function bookingsQueue(): Queue {
  if (_bookingsQueue) return _bookingsQueue;
  _bookingsQueue = new Queue('bookings', { connection: connection() });
  return _bookingsQueue;
}

/** Default options for re-enqueued recurring jobs. Keeps Redis tidy. */
export const DEFAULT_REPEAT_OPTS = {
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400, count: 100 },
};

export async function closeQueues(): Promise<void> {
  if (_bookingsQueue) await _bookingsQueue.close();
  if (_connection) await _connection.quit();
  _bookingsQueue = null;
  _connection = null;
}
