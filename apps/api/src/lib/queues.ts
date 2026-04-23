import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let _connection: IORedis | null = null;
function connection(): IORedis {
  if (_connection) return _connection;
  _connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  return _connection;
}

export const bookingsQueue = new Queue('bookings', { connection: connection() });
export const ocppCommandsQueue = new Queue('ocpp-commands', { connection: connection() });
export const notificationsQueue = new Queue('notifications', { connection: connection() });
