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
  return settleSessionById(job.data.sessionId);
}

export async function settleSessionById(sessionId: string) {
  const session = await prisma.chargingSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { booking: { include: { charger: true } } },
  });
  if (!session.endedAt) {
    throw new Error('Session not ended');
  }

  // AUDIT H9: short-circuit if already captured. Stripe returns an error on
  // double-capture which would fail the job and BullMQ would retry forever.
  if (session.booking.capturedAmountCents != null) {
    logger.info(
      { sessionId: session.id, bookingId: session.bookingId },
      'settle_session: booking already captured; skipping',
    );
    return;
  }

  const charger = session.booking.charger;
  // Defensive bounds on the charger-reported energy:
  //  - never negative (meter rollover) → no negative capture.
  //  - never more than the hardware could physically deliver over the session
  //    (powerKw × hours, +25% headroom + 2 kWh slack). A compromised/rogue
  //    Tier-3 charger could otherwise report inflated kWh; the final amount is
  //    still independently clamped to the pre-auth below, this just stops the
  //    energy figure itself from being absurd.
  const elapsedHours = Math.max(
    0,
    (session.endedAt.getTime() - session.startedAt.getTime()) / 3_600_000,
  );
  const maxPlausibleKwh = charger.powerKw * elapsedHours * 1.25 + 2;
  const kwh = Math.min(Math.max(0, session.finalKwh ?? 0), maxPlausibleKwh);
  const energyCents =
    charger.pricePerKwhCents != null
      ? Math.round(charger.pricePerKwhCents * kwh)
      : charger.pricePerHourCents != null
        ? Math.round(
            charger.pricePerHourCents *
              ((session.endedAt.getTime() - session.startedAt.getTime()) / 3_600_000),
          )
        : 0;
  // AUDIT H6: fee and total must be computed on the same base that Stripe will
  // actually capture. The PI was created with application_fee_amount =
  // feeCents(totalCents); at capture time we compute the fee off the clamped
  // amount_to_capture so Stripe accounting stays consistent.
  const rawTotal = energyCents + feeCents(energyCents);
  const amountToCapture = Math.min(rawTotal, session.booking.preauthAmountCents);
  const fee = feeCents(amountToCapture);

  await prisma.chargingSession.update({
    where: { id: session.id },
    data: { finalCostCents: energyCents },
  });

  // Skip Stripe capture for dev-bypass synthetic PIs. We still settle the
  // booking row + Payout below so the full demo flow ends in a "completed"
  // state and the receipt screen renders normally.
  const isDevPi = session.booking.stripePaymentIntentId?.startsWith('pi_dev_');
  if (session.booking.stripePaymentIntentId && stripe && amountToCapture > 0 && !isDevPi) {
    // AUDIT H9: idempotency key so BullMQ retry after a partial failure doesn't
    // error with "already captured".
    await stripe.paymentIntents.capture(
      session.booking.stripePaymentIntentId,
      {
        amount_to_capture: amountToCapture,
        application_fee_amount: fee,
      },
      { idempotencyKey: `capture:${session.bookingId}` },
    );
  }

  await prisma.booking.update({
    where: { id: session.bookingId },
    data: { status: 'completed', capturedAmountCents: amountToCapture },
  });

  // AUDIT H9: upsert keyed on bookingId (Payout.bookingId is @unique in the
  // schema) so a retry after a post-capture crash doesn't create a second row.
  await prisma.payout.upsert({
    where: { bookingId: session.bookingId },
    create: {
      hostId: session.booking.charger.hostId,
      bookingId: session.bookingId,
      grossCents: amountToCapture,
      platformFeeCents: fee,
      netCents: amountToCapture - fee,
      status: 'pending',
    },
    update: {
      grossCents: amountToCapture,
      platformFeeCents: fee,
      netCents: amountToCapture - fee,
    },
  });

  logger.info({ sessionId: session.id, amountToCapture, fee }, 'session settled');
}
