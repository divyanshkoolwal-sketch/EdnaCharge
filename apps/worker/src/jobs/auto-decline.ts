import type { Job } from 'bullmq';
import Stripe from 'stripe';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';
import { Sentry } from '../sentry.js';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

let _notifyQueue: Queue | null = null;
function notificationsQueue(): Queue {
  if (_notifyQueue) return _notifyQueue;
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  _notifyQueue = new Queue('notifications', { connection });
  return _notifyQueue;
}

export async function autoDecline(job: Job<{ bookingId: string }>) {
  return autoDeclineById(job.data.bookingId);
}

export async function autoDeclineById(bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return;
  // AUDIT H2: optimistic update — only flip pending→declined if the row is
  // still pending at write time. Otherwise the host already responded.
  const res = await prisma.booking.updateMany({
    where: { id: b.id, status: 'pending' },
    data: { status: 'declined', respondedAt: new Date(), declineReason: 'auto_timeout' },
  });
  if (res.count !== 1) return; // already resolved; nothing to do.
  if (b.stripePaymentIntentId && stripe) {
    try {
      await stripe.paymentIntents.cancel(b.stripePaymentIntentId, undefined, {
        idempotencyKey: `cancel:${b.id}`,
      });
    } catch (err) {
      // AUDIT (was silent-swallow): log + Sentry.
      logger.warn({ err, bookingId: b.id }, 'auto-decline: stripe cancel failed');
      Sentry.captureException(err);
    }
  }
  const thread = await prisma.chatThread.findUnique({ where: { bookingId: b.id } });
  if (thread) {
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderId: null,
        kind: 'system',
        body: 'Booking auto-declined: host did not respond in time.',
      },
    });
  }
  // Notify the driver (host never responded — driver should retry with another charger).
  try {
    await notificationsQueue().add('booking_auto_declined', {
      driverId: b.driverId,
      bookingId: b.id,
    });
  } catch (err) {
    logger.warn({ err, bookingId: b.id }, 'auto-decline: failed to enqueue notification');
  }
  logger.info({ bookingId: b.id }, 'booking auto-declined');
}
