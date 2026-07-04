-- Hardware device integration: Tier 1 (Shelly Plug S) + Tier 2 (Shelly Pro EM-50)
-- Creates the ShellDevice table and DeviceStatus enum.
-- Applied automatically by `supabase db reset` or `prisma db push`.

DO $$ BEGIN
  CREATE TYPE "DeviceStatus" AS ENUM ('provisioned', 'active', 'offline', 'error');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ShellDevice" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "chargerId"       UUID NOT NULL UNIQUE REFERENCES "Charger"("id") ON DELETE CASCADE,
  "shellyDeviceId"  TEXT NOT NULL UNIQUE,
  "mac"             TEXT NOT NULL UNIQUE,
  "mqttClientId"    TEXT NOT NULL,
  "mqttTopicPrefix" TEXT NOT NULL,
  "certFingerprint" TEXT,
  "firmwareVersion" TEXT,
  "hardwareModel"   TEXT NOT NULL,
  "status"          "DeviceStatus" NOT NULL DEFAULT 'provisioned',
  "lastSeenAt"      TIMESTAMPTZ,
  "lastMeterKwh"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ShellDevice_status_idx" ON "ShellDevice"("status");
CREATE INDEX IF NOT EXISTS "ShellDevice_shellyDeviceId_idx" ON "ShellDevice"("shellyDeviceId");

-- RLS: hosts can read their own device row; service role can write.
ALTER TABLE "ShellDevice" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "host_read_own_device" ON "ShellDevice"
  FOR SELECT
  USING (
    "chargerId" IN (
      SELECT id FROM "Charger" WHERE "hostId" = auth.uid()
    )
  );

CREATE POLICY "service_role_all" ON "ShellDevice"
  FOR ALL
  USING (auth.role() = 'service_role');
