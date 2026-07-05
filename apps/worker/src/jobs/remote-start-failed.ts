/** @file apps/worker/src/jobs/remote-start-failed.ts. */
import Stripe from 'stripe';
import { prisma } from '@edna/db';
import { notificationsQueue } from '../lib/queues.js';
import { logger } from '../logger.js';

export type RemoteStartFailedPayload = { bookingId: string; reason?: string };

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

async function cancelPaymentIntent(id: string | null, bookingId: string) {
  if (!id || id.startsWith('pi_dev_')) return;
  if (!stripe) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'STRIPE_SECRET_KEY not configured; refusing to leave remote-start hold open.',
      );
    }
    logger.warn(
      { bookingId, paymentIntentId: id },
      'stripe unavailable; cannot cancel remote-start hold',
    );
    return;
  }
  try {
    await stripe.paymentIntents.cancel(id, undefined, {
      idempotencyKey: `cancel:remote_start_failed:${bookingId}`,
    });
  } catch (err) {
    logger.warn(
      { err, bookingId, paymentIntentId: id },
      'stripe cancel after remote-start failure failed',
    );
    throw err;
  }
}

export async function handleRemoteStartFailed(payload: RemoteStartFailedPayload) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: payload.bookingId },
    include: { charger: { select: { hostId: true, title: true } }, chatThread: true },
  });
  if (!['pending', 'confirmed'].includes(booking.status)) return;

  await cancelPaymentIntent(booking.stripePaymentIntentId, booking.id);
  const updated = await prisma.booking.updateMany({
    where: { id: booking.id, status: { in: ['pending', 'confirmed'] } },
    data: {
      status: 'errored',
      declineReason: 'Remote start failed',
      ocppStartToken: null,
      ocppAuthorizedAt: null,
    },
  });
  if (updated.count !== 1) return;

  const thread =
    booking.chatThread ?? (await prisma.chatThread.create({ data: { bookingId: booking.id } }));
  await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      senderId: null,
      kind: 'system',
      body: `Charging could not start on ${booking.charger.title}. Your card hold was released.`,
    },
  });
  await notificationsQueue().add('booking_errored', {
    driverId: booking.driverId,
    hostId: booking.charger.hostId,
    bookingId: booking.id,
  });
}
