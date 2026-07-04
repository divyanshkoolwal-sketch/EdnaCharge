/** @file apps/api/src/lib/queues.ts. */
import { createQueue, createRedisConnection } from '@edna/server-utils';

const connection = createRedisConnection();

export const bookingsQueue = createQueue('bookings', connection);
export const ocppCommandsQueue = createQueue('ocpp-commands', connection);
export const notificationsQueue = createQueue('notifications', connection);
