-- MVP prod-readiness hardening: OCPP-only launch, receipts, review moderation,
-- support tickets, and direct-client write revocations.

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'booking_errored';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'booking_cancelled';

ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "stripeChargeId" text,
  ADD COLUMN IF NOT EXISTS "stripeReceiptUrl" text;

ALTER TABLE "Review"
  ADD COLUMN IF NOT EXISTS "hiddenAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "hiddenReason" text;

ALTER TABLE "ChargerWaitlist"
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS "ChargerWaitlist_userId_key"
  ON "ChargerWaitlist" ("userId");
CREATE INDEX IF NOT EXISTS "ChargerWaitlist_status_createdAt_idx"
  ON "ChargerWaitlist" (status, "createdAt");

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "bookingId" uuid REFERENCES "Booking"(id) ON DELETE SET NULL,
  "sessionId" uuid REFERENCES "ChargingSession"(id) ON DELETE SET NULL,
  "payoutId" uuid REFERENCES "Payout"(id) ON DELETE SET NULL,
  "contentReportId" uuid REFERENCES "ContentReport"(id) ON DELETE SET NULL,
  "stripePaymentIntentId" text,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "SupportTicket_userId_createdAt_idx"
  ON "SupportTicket" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicket_bookingId_idx"
  ON "SupportTicket" ("bookingId");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_createdAt_idx"
  ON "SupportTicket" (status, "createdAt");

ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_ticket_read_self" ON "SupportTicket";
CREATE POLICY "support_ticket_read_self" ON "SupportTicket"
  FOR SELECT USING (auth.uid() = "userId");

REVOKE ALL ON "SupportTicket" FROM anon, authenticated;

DROP POLICY IF EXISTS "reviews_author_insert" ON "Review";
REVOKE INSERT, UPDATE, DELETE ON "Review" FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON "HostProfile" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON "Charger" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON "Payout" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON "ChargingSession" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON "MeterValue" FROM anon, authenticated;

-- Hidden reviews stay accessible to service-role/API reads but are not exposed
-- through client-role direct reads.
DROP POLICY IF EXISTS "reviews_read_any" ON "Review";
CREATE POLICY "reviews_read_visible" ON "Review"
  FOR SELECT USING ("hiddenAt" IS NULL);
