-- Support anonymize-in-place account deletion. Hard-deleting a User cascaded
-- through Chargers → other drivers' Bookings → their Reviews/Sessions and the
-- host Payout ledger, irreversibly destroying counterparties' marketplace and
-- financial history. We now null PII and set deletedAt instead, keeping the row.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;
