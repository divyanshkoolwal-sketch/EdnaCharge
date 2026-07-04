-- Track payouts clawed back by a refund or a lost dispute so host earnings stop
-- counting money Stripe already reversed out of the connected account.
ALTER TABLE "Payout"
  ADD COLUMN IF NOT EXISTS "reversedAt" timestamptz;
