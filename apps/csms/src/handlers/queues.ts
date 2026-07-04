/** BullMQ producer helpers used by OCPP handlers. */
import type IORedis from 'ioredis';
import { createQueue, createRedisConnection } from '@edna/server-utils';
import type { Queue } from 'bullmq';

let _connection: IORedis | null = null;
let _bookings: Queue | null = null;
let _notifications: Queue | null = null;

function connection(): IORedis {
  if (_connection) return _connection;
  _connection = createRedisConnection();
  return _connection;
}

export function bookingsQueue(): Queue {
  if (_bookings) return _bookings;
  _bookings = createQueue('bookings', connection());
  return _bookings;
}

export function notificationsQueue(): Queue {
  if (_notifications) return _notifications;
  _notifications = createQueue('notifications', connection());
  return _notifications;
}

export async function closeQueues(): Promise<void> {
  if (_bookings) await _bookings.close();
  if (_notifications) await _notifications.close();
  if (_connection) await _connection.quit();
  _bookings = null;
  _notifications = null;
  _connection = null;
}
