/**
 * Singleton BullMQ Queue + IORedis connection. Worker jobs need to enqueue
 * scheduled continuation jobs (e.g., next meter poll, settle_session); without this each
 * call would create + leak a fresh Redis connection.
 */

import type IORedis from 'ioredis';
import { createQueue, createRedisConnection, DEFAULT_JOB_OPTS } from '@edna/server-utils';
import type { Queue } from 'bullmq';

let _connection: IORedis | null = null;
let _bookingsQueue: Queue | null = null;
let _notificationsQueue: Queue | null = null;

export function redisConnection(): IORedis {
  if (_connection) return _connection;
  _connection = createRedisConnection();
  return _connection;
}

export function bookingsQueue(): Queue {
  if (_bookingsQueue) return _bookingsQueue;
  _bookingsQueue = createQueue('bookings', redisConnection());
  return _bookingsQueue;
}

export function notificationsQueue(): Queue {
  if (_notificationsQueue) return _notificationsQueue;
  _notificationsQueue = createQueue('notifications', redisConnection());
  return _notificationsQueue;
}

/** Default options for re-enqueued recurring jobs. Keeps Redis tidy. */
export const DEFAULT_REPEAT_OPTS = DEFAULT_JOB_OPTS;

export async function closeQueues(): Promise<void> {
  if (_bookingsQueue) await _bookingsQueue.close();
  if (_notificationsQueue) await _notificationsQueue.close();
  if (_connection) await _connection.quit();
  _bookingsQueue = null;
  _notificationsQueue = null;
  _connection = null;
}
