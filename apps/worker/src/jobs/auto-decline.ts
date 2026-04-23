import type { Job } from 'bullmq';
import Stripe from 'stripe';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

export async function autoDecline(job: Job<{ bookingId: string }>) {
  const b = await prisma.booking.findUnique({ where: { id: job.data.bookingId } });
  if (!b) return;
  if (b.status !== 'pending') return; // already resolved
  if (b.stripePaymentIntentId && stripe) {
    await stripe.paymentIntents.cancel(b.stripePaymentIntentId).catch(() => {});
  }
  await prisma.booking.update({
    where: { id: b.id },
    data: { status: 'declined', respondedAt: new Date(), declineReason: 'auto_timeout' },
  });
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
  logger.info({ bookingId: b.id }, 'booking auto-declined');
}
