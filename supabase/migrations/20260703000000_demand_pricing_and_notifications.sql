-- Demand-based pricing rate-lock + persisted notifications feed.
-- Applied by `supabase db reset` or `prisma db push` (prod: run via psql).

-- 1) Rate-lock: snapshot the demand $/kWh rate quoted at booking time so the
--    pre-auth and the final capture use the same rate even if demand shifts.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "ratePerKwhCents" INTEGER;

-- 2) Notifications feed backing the in-app notifications screen.
DO $$ BEGIN
  CREATE TYPE "NotificationKind" AS ENUM (
    'new_booking_request',
    'booking_accepted',
    'booking_declined',
    'booking_auto_declined',
    'new_chat_message',
    'session_started',
    'session_stopped',
    'review_left'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    UUID NOT NULL,
  "kind"      "NotificationKind" NOT NULL,
  "recipientRole" TEXT,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "bookingId" UUID,
  "threadId"  UUID,
  "sessionId" UUID,
  "readAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- Notifications are read/written only by the backend (service_role, which
-- bypasses RLS). Deny-by-default for client roles, matching the security-audit
-- hardening for server-only tables.
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Notification" FROM anon, authenticated;
