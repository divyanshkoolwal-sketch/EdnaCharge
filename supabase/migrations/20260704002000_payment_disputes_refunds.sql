-- Payments observability: track refunds and disputes/chargebacks on bookings so
-- the app and host earnings reflect money that Stripe reversed after capture.
-- Paired with new Stripe webhook handlers for charge.refunded,
-- charge.dispute.*, payment_intent.payment_failed, and payout.failed.

ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "refundedAmountCents" integer,
  ADD COLUMN IF NOT EXISTS "disputeStatus" text;
