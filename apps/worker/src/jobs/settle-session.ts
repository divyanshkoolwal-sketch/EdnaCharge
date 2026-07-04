/** @file apps/worker/src/jobs/settle-session.ts. */
import Stripe from 'stripe';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

const PLATFORM_FEE_BPS = 1500;
const feeCents = (n: number) => Math.round((n * PLATFORM_FEE_BPS) / 10_000);

function chargeFromIntent(pi: Stripe.PaymentIntent | null): Stripe.Charge | null {
  const charge = pi?.latest_charge;
  return charge && typeof charge !== 'string' ? charge : null;
}

async function retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent | null> {
  if (!stripe || id.startsWith('pi_dev_')) return null;
  return stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
}

export async function settleSessionById(sessionId: string) {
  const session = await prisma.chargingSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { booking: { include: { charger: true } } },
  });
  if (!session.endedAt) {
    throw new Error('Session not ended');
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
  // Bill at the demand rate LOCKED on the booking at request time — never the
  // charger's current rate, which can differ once pricing moves with demand.
  // Fall back to the charger's stored per-kWh (legacy rows), then legacy
  // per-hour, so old bookings still settle.
  const lockedRateCents = session.booking.ratePerKwhCents ?? charger.pricePerKwhCents;
  const energyCents =
    lockedRateCents != null
      ? Math.round(lockedRateCents * kwh)
      : charger.pricePerHourCents != null
        ? Math.round(charger.pricePerHourCents * elapsedHours)
        : 0;
  const rawTotal = energyCents + feeCents(energyCents);
  const amountToCapture = Math.min(rawTotal, session.booking.preauthAmountCents);
  // Fee = 15% of min(energy, captured). Normal (un-clamped) capture → 15% of
  // energy, and the host receives the full energy value.
  //
  // DELIBERATE PRODUCT DECISION (not a bug — reviewers keep re-raising it): when a
  // session over-runs and the capture is clamped to the pre-auth, the shortfall is
  // split 85/15 proportionally (fee = 15% of the clamped capture). The alternative
  // is "host made whole first" (host takes the full clamp, platform fee → $0). See
  // docs/todo.md — the "who eats the over-run shortfall?" decision is still open.
  // Whichever is chosen, `fee` and the Payout must be computed on the SAME captured
  // base so host earnings and the receipt agree.
  const fee = feeCents(Math.min(energyCents, amountToCapture));

  await prisma.chargingSession.update({
    where: { id: session.id },
    data: { finalCostCents: energyCents },
  });

  // Skip Stripe capture for dev-bypass synthetic PIs. We still settle the
  // booking row + Payout below so the full demo flow ends in a "completed"
  // state and the receipt screen renders normally.
  const isDevPi = session.booking.stripePaymentIntentId?.startsWith('pi_dev_');
  // Never silently complete a real booking without capturing. If Stripe isn't
  // configured in production, fail the job (BullMQ retries) instead of marking
  // the booking paid + creating a Payout with no transfer.
  if (
    process.env.NODE_ENV === 'production' &&
    session.booking.stripePaymentIntentId &&
    !isDevPi &&
    !stripe
  ) {
    throw new Error(
      'STRIPE_SECRET_KEY not configured; refusing to settle a real booking without Stripe.',
    );
  }
  let pi: Stripe.PaymentIntent | null = null;
  if (session.booking.capturedAmountCents != null) {
    pi = session.booking.stripePaymentIntentId
      ? await retrievePaymentIntent(session.booking.stripePaymentIntentId)
      : null;
  } else if (session.booking.stripePaymentIntentId && stripe && amountToCapture > 0 && !isDevPi) {
    // AUDIT H9: idempotency key so BullMQ retry after a partial failure doesn't
    // error with "already captured".
    pi = await stripe.paymentIntents.capture(
      session.booking.stripePaymentIntentId,
      {
        amount_to_capture: amountToCapture,
        application_fee_amount: fee,
        expand: ['latest_charge'],
      },
      { idempotencyKey: `capture:${session.bookingId}` },
    );
  } else if (session.booking.stripePaymentIntentId && stripe && amountToCapture === 0 && !isDevPi) {
    await stripe.paymentIntents.cancel(session.booking.stripePaymentIntentId, undefined, {
      idempotencyKey: `cancel:${session.bookingId}:zero_capture`,
    });
  }
  const charge = chargeFromIntent(pi);
  const recordedCapture = session.booking.capturedAmountCents ?? amountToCapture;
  // Fee for the Payout, on the same base as the capture above but measured
  // against what was ACTUALLY captured (the webhook-first path may have recorded
  // a different amount than this run's amountToCapture).
  const recordedFee = feeCents(Math.min(energyCents, recordedCapture));
  const transferId = typeof charge?.transfer === 'string' ? charge.transfer : null;

  await prisma.booking.update({
    where: { id: session.bookingId },
    data: {
      status: 'completed',
      capturedAmountCents: recordedCapture,
      // Reconcile the fee to what was ACTUALLY taken (estimate-time fee stored at
      // request can differ once metered kWh ≠ estimate). Host screens derive net
      // as capturedAmountCents − platformFeeCents, so this keeps them correct.
      platformFeeCents: recordedFee,
      stripeChargeId: charge?.id ?? session.booking.stripeChargeId,
      stripeReceiptUrl: charge?.receipt_url ?? session.booking.stripeReceiptUrl,
    },
  });

  // AUDIT H9: upsert keyed on bookingId (Payout.bookingId is @unique in the
  // schema) so a retry after a post-capture crash doesn't create a second row.
  await prisma.payout.upsert({
    where: { bookingId: session.bookingId },
    create: {
      hostId: session.booking.charger.hostId,
      bookingId: session.bookingId,
      grossCents: recordedCapture,
      platformFeeCents: recordedFee,
      netCents: recordedCapture - recordedFee,
      stripeTransferId: transferId,
      status: 'pending',
    },
    update: {
      grossCents: recordedCapture,
      platformFeeCents: recordedFee,
      netCents: recordedCapture - recordedFee,
      stripeTransferId: transferId ?? undefined,
    },
  });

  logger.info(
    { sessionId: session.id, amountToCapture: recordedCapture, fee: recordedFee },
    'session settled',
  );
}
