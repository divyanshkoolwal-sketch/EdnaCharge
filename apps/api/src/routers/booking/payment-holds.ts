/** Stripe/manual-capture hold helper for booking request flows. */
import { TRPCError } from '@trpc/server';
import { stripe } from '../../lib/stripe.js';
import { cancelStripePaymentIntent } from './helpers.js';

type BookingHoldInput = {
  idempotencyKey: string;
  devMode: boolean;
  amountCents: number;
  platformFeeCents: number;
  customerId?: string;
  paymentMethodId?: string;
  destinationAccountId?: string;
  receiptEmail?: string | null;
  userId: string;
  chargerId: string;
};

export async function authorizeBookingHold(input: BookingHoldInput): Promise<string> {
  if (input.devMode) return `pi_dev_${input.idempotencyKey.slice(0, 16)}`;

  const pi = await stripe().paymentIntents.create(
    {
      amount: input.amountCents,
      currency: 'usd',
      customer: input.customerId!,
      payment_method: input.paymentMethodId!,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
      application_fee_amount: input.platformFeeCents,
      transfer_data: { destination: input.destinationAccountId! },
      receipt_email: input.receiptEmail ?? undefined,
      metadata: { ednaUserId: input.userId, chargerId: input.chargerId },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  if (pi.status !== 'requires_capture') {
    await cancelStripePaymentIntent(pi.id, `cancel:${pi.id}:unexpected_status`);
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Card authorization did not complete. Try another payment method.',
    });
  }
  return pi.id;
}
