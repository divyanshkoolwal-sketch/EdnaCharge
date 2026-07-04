/** @file apps/api/src/webhooks/stripe-payment-events.ts. */
// Handlers for the refund / dispute / payment-failure / payout-failure Stripe
// events, split out of stripe.ts to keep that file focused on transport + dedup.
import type Stripe from 'stripe';
import { prisma } from '@edna/db';
import { logger } from '../logger.js';
import { Sentry } from '@edna/server-utils';

/**
 * Recompute a Payout's amounts after a refund. `amountRefunded` is Stripe's
 * CUMULATIVE charge.amount_refunded, and `originalGross` is the IMMUTABLE
 * original capture (Booking.capturedAmountCents) — recomputing from the original
 * every event makes repeated webhooks idempotent (decrementing already-mutated
 * Payout fields would double-subtract). A full refund reverses the row; a
 * partial one claws back proportionally on the host's NET share only.
 */
export function refundedPayoutAmounts(input: {
  originalGross: number;
  platformFeeCents: number;
  amountRefunded: number;
}): { reversed: boolean; netCents: number; grossCents: number } {
  const { originalGross, platformFeeCents, amountRefunded } = input;
  if (originalGross > 0 && amountRefunded >= originalGross) {
    return { reversed: true, netCents: 0, grossCents: 0 };
  }
  const originalNet = originalGross - platformFeeCents;
  const kept = originalGross - amountRefunded;
  const netCents =
    originalGross > 0 ? Math.max(0, Math.round((originalNet * kept) / originalGross)) : 0;
  return { reversed: false, netCents, grossCents: Math.max(0, kept) };
}

/** Map a Stripe dispute event to the Booking.disputeStatus we persist. */
export function disputeStatusFor(created: boolean, stripeStatus: string | null | undefined): string {
  if (created) return 'open';
  if (stripeStatus === 'won') return 'won';
  if (stripeStatus === 'lost') return 'lost';
  return stripeStatus ?? 'closed';
}

/** A capture/auth failed out of band — reconcile so the booking doesn't hang. */
export async function handlePaymentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { stripePaymentIntentId: pi.id },
    include: { chatThread: true },
  });
  if (!booking) return;
  if (booking.status !== 'pending' && booking.status !== 'confirmed') return;
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: 'errored',
      declineReason:
        booking.declineReason ?? `stripe:${pi.last_payment_error?.code ?? 'payment_failed'}`,
    },
  });
  if (booking.chatThread) {
    await prisma.chatMessage.create({
      data: {
        threadId: booking.chatThread.id,
        senderId: null,
        kind: 'system',
        body: 'Booking errored: the payment could not be processed.',
      },
    });
  }
}

/** Record the refunded total so the receipt + host earnings reflect it. */
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
  if (!piId) return;
  const booking = await prisma.booking.findUnique({
    where: { stripePaymentIntentId: piId },
    include: { chatThread: true },
  });
  if (!booking) return;
  await prisma.booking.update({
    where: { id: booking.id },
    data: { refundedAmountCents: charge.amount_refunded },
  });
  // Reflect the refund on the Payout so host earnings stop counting clawed-back
  // funds. Full refund → reverse the row; partial → recompute the host's net.
  const payout = await prisma.payout.findUnique({ where: { bookingId: booking.id } });
  if (payout && payout.reversedAt == null) {
    const amounts = refundedPayoutAmounts({
      // Base off the IMMUTABLE original capture, not the (already-mutated) Payout.
      originalGross: booking.capturedAmountCents ?? payout.grossCents,
      platformFeeCents: payout.platformFeeCents,
      amountRefunded: charge.amount_refunded,
    });
    await prisma.payout.update({
      where: { bookingId: booking.id },
      data: amounts.reversed
        ? { reversedAt: new Date(), netCents: 0, grossCents: 0 }
        : { netCents: amounts.netCents, grossCents: amounts.grossCents },
    });
  }
  if (booking.chatThread) {
    await prisma.chatMessage.create({
      data: {
        threadId: booking.chatThread.id,
        senderId: null,
        kind: 'system',
        body: `A refund of $${(charge.amount_refunded / 100).toFixed(2)} was issued for this booking.`,
      },
    });
  }
}

/** Track a dispute/chargeback so host earnings don't count clawed-back funds. */
export async function handleDispute(dispute: Stripe.Dispute, created: boolean): Promise<void> {
  const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null;
  if (!piId) return;
  const booking = await prisma.booking.findUnique({ where: { stripePaymentIntentId: piId } });
  if (!booking) return;
  const disputeStatus = disputeStatusFor(created, dispute.status);
  await prisma.booking.update({ where: { id: booking.id }, data: { disputeStatus } });
  // A lost dispute means Stripe reversed the transfer (host lost the funds) plus
  // a dispute fee — reverse the Payout so host earnings don't keep counting it.
  if (disputeStatus === 'lost') {
    await prisma.payout
      .updateMany({
        where: { bookingId: booking.id, reversedAt: null },
        data: { reversedAt: new Date(), netCents: 0 },
      })
      .catch(() => {});
  }
  logger.warn({ bookingId: booking.id, disputeId: dispute.id, disputeStatus }, 'stripe dispute recorded');
}

/** Host bank payout failed. Can't map to one booking, so alert for follow-up. */
export function handlePayoutFailed(payout: Stripe.Payout): void {
  logger.error(
    { payoutId: payout.id, amount: payout.amount, failureCode: payout.failure_code },
    'stripe host payout failed — manual follow-up required',
  );
  Sentry.captureException(
    new Error(`Stripe payout failed: ${payout.id} (${payout.failure_code ?? 'unknown'})`),
  );
}
