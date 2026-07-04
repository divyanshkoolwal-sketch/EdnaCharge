/** @file apps/worker/src/jobs/cancel-hold.ts. */
import Stripe from 'stripe';
import { logger } from '../logger.js';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

export type CancelHoldPayload = { paymentIntentId: string; reason?: string };

/**
 * Durably release a Stripe manual-capture hold. Booking modify enqueues this to
 * cancel the OLD authorization after placing a new one — retryable via BullMQ
 * rather than best-effort inline, so a transient Stripe error can't strand a live
 * hold on the driver's card until it expires ~7 days later. Observable: failures
 * land in the queue's failed set + logs.
 */
export async function cancelHold(payload: CancelHoldPayload): Promise<void> {
  const { paymentIntentId } = payload;
  if (!paymentIntentId || paymentIntentId.startsWith('pi_dev_') || !stripe) return;
  try {
    await stripe.paymentIntents.cancel(paymentIntentId, undefined, {
      idempotencyKey: `cancel_hold:${paymentIntentId}`,
    });
    logger.info({ paymentIntentId, reason: payload.reason }, 'cancel_hold: released');
  } catch (err) {
    const e = err as { code?: string; raw?: { code?: string } };
    const code = e?.code ?? e?.raw?.code;
    // Already canceled / captured / gone → terminal, don't retry.
    if (code === 'payment_intent_unexpected_state' || code === 'resource_missing') {
      logger.info({ paymentIntentId, code }, 'cancel_hold: already resolved');
      return;
    }
    // Transient (network / rate limit / 5xx) → throw so BullMQ retries.
    logger.warn({ err, paymentIntentId }, 'cancel_hold: failed, will retry');
    throw err;
  }
}
