-- Tier-3 (OCPP-only) v1 changes:
--  1. Charger.ocppConnectedAt — live websocket connection state, stamped by the
--     CSMS on connect / cleared on disconnect, so the API can show the host a
--     "charger connected" indicator.
--  2. ChargerWaitlist — hosts whose charger can't speak OCPP to our CSMS.
-- Applied automatically by `supabase db reset` or `prisma db push`.

ALTER TABLE "Charger" ADD COLUMN IF NOT EXISTS "ocppConnectedAt" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "ChargerWaitlist" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"        UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "email"         TEXT NOT NULL,
  "chargerBrand"  TEXT,
  "note"          TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ChargerWaitlist_userId_idx" ON "ChargerWaitlist"("userId");

-- RLS: a user can read their own waitlist rows; only the service role writes
-- (all inserts go through the API, which connects as the service role).
ALTER TABLE "ChargerWaitlist" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_read_own_waitlist" ON "ChargerWaitlist"
  FOR SELECT
  USING ("userId" = auth.uid());

CREATE POLICY "service_role_all" ON "ChargerWaitlist"
  FOR ALL
  USING (auth.role() = 'service_role');
