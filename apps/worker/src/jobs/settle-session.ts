import type { Job } from 'bullmq';
import Stripe from 'stripe';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

const PLATFORM_FEE_BPS = 1500;
const feeCents = (n: number) => Math.round((n * PLATFORM_FEE_BPS) / 10_000);

export async function settleSession(job: Job<{ sessionId: string }>) {
  const session = await prisma.chargingSession.findUniqueOrThrow({
    where: { id: job.data.sessionId },
    include: { booking: { include: { charger: true } } },
  });
  if (!session.endedAt) {
    throw new Error('Session not ended');
  }

  const kwh = session.finalKwh ?? 0;
  const charger = session.booking.charger;
  const energyCents =
    charger.pricePerKwhCents != null
      ? Math.round(charger.pricePerKwhCents * kwh)
      : charger.pricePerHourCents != null
        ? Math.round(
            charger.pricePerHourCents *
              ((session.endedAt.getTime() - session.startedAt.getTime()) / 3_600_000),
          )
        : 0;
  const fee = feeCents(energyCents);
  const total = energyCents + fee;

  await prisma.chargingSession.update({
    where: { id: session.id },
    data: { finalCostCents: energyCents },
  });

  if (session.booking.stripePaymentIntentId && stripe && total > 0) {
    // Capture only the real amount (might be less than pre-auth).
    await stripe.paymentIntents.capture(session.booking.stripePaymentIntentId, {
      amount_to_capture: Math.min(total, session.booking.preauthAmountCents),
      application_fee_amount: fee,
    });
  }

  await prisma.booking.update({
    where: { id: session.bookingId },
    data: { status: 'completed', capturedAmountCents: total },
  });

  await prisma.payout.create({
    data: {
      hostId: session.booking.charger.hostId,
      bookingId: session.bookingId,
      grossCents: total,
      platformFeeCents: fee,
      netCents: total - fee,
      status: 'pending',
    },
  });

  logger.info({ sessionId: session.id, total, fee }, 'session settled');
}
