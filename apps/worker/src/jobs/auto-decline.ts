/** @file apps/worker/src/jobs/auto-decline.ts. */
import Stripe from 'stripe';
import { prisma } from '@edna/db';
import { notificationsQueue } from '../lib/queues.js';
import { logger } from '../logger.js';
import { Sentry } from '@edna/server-utils';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

const AUTO_DECLINE_MSG = 'Booking auto-declined: host did not respond in time.';

export async function autoDeclineById(bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return;

  if (b.status === 'pending') {
    // Optimistic update — only flip pending→declined if still pending at write
    // time. Otherwise the host already responded.
    const res = await prisma.booking.updateMany({
      where: { id: b.id, status: 'pending' },
      data: { status: 'declined', respondedAt: new Date(), declineReason: 'auto_timeout' },
    });
    if (res.count !== 1) return; // resolved by the host between read and write.
    if (b.stripePaymentIntentId && stripe) {
      try {
        await stripe.paymentIntents.cancel(b.stripePaymentIntentId, undefined, {
          idempotencyKey: `cancel:${b.id}`,
        });
      } catch (err) {
        logger.warn({ err, bookingId: b.id }, 'auto-decline: stripe cancel failed');
        Sentry.captureException(err);
      }
    }
  } else if (!(b.status === 'declined' && b.declineReason === 'auto_timeout')) {
    // Already resolved another way (host accepted/declined) — nothing to do.
    return;
  }

  // Side effects run whenever the booking is auto-declined — INCLUDING a retry
  // after a prior attempt flipped the status but failed before notifying. Both
  // are deduped so a retry can't double-post. (Previously the early-return on an
  // already-declined row lost the chat message + push on any retry.)
  const thread = await prisma.chatThread.findUnique({ where: { bookingId: b.id } });
  if (thread) {
    const already = await prisma.chatMessage.findFirst({
      where: { threadId: thread.id, senderId: null, body: AUTO_DECLINE_MSG },
      select: { id: true },
    });
    if (!already) {
      await prisma.chatMessage.create({
        data: { threadId: thread.id, senderId: null, kind: 'system', body: AUTO_DECLINE_MSG },
      });
    }
  }
  // jobId dedups the push across retries. Let a failure here throw so the job
  // retries rather than silently dropping the notification.
  await notificationsQueue().add(
    'booking_auto_declined',
    { driverId: b.driverId, bookingId: b.id },
    { jobId: `auto_declined:${b.id}` },
  );
  logger.info({ bookingId: b.id }, 'booking auto-declined');
}
