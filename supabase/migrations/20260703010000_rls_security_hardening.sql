-- Production RLS/security hardening. RLS policy source of truth is migrations.

-- Two drivers must not be able to hold overlapping non-terminal bookings on the
-- same charger. Enforced at the database layer so it survives any application
-- logic path.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS booking_no_overlap;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS slot tsrange;

CREATE OR REPLACE FUNCTION booking_fill_slot() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.slot := tsrange(
    (NEW."startAt" AT TIME ZONE 'UTC')::timestamp,
    (NEW."endAt" AT TIME ZONE 'UTC')::timestamp
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS booking_fill_slot_trg ON "Booking";
CREATE TRIGGER booking_fill_slot_trg
  BEFORE INSERT OR UPDATE OF "startAt", "endAt" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION booking_fill_slot();

UPDATE "Booking" SET "startAt" = "startAt" WHERE slot IS NULL;

ALTER TABLE "Booking" ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist ("chargerId" WITH =, slot WITH &&)
  WHERE (status IN ('pending', 'confirmed', 'active'));

-- Split booking updates by role so direct client access cannot flip arbitrary
-- server-managed columns or booking states.
DROP POLICY IF EXISTS "bookings_update_party" ON "Booking";
DROP POLICY IF EXISTS "bookings_driver_update_limited" ON "Booking";
DROP POLICY IF EXISTS "bookings_host_update_limited" ON "Booking";

CREATE POLICY "bookings_driver_update_limited" ON "Booking"
  FOR UPDATE USING (auth.uid() = "driverId")
  WITH CHECK (
    auth.uid() = "driverId"
    AND status IN ('cancelled', 'pending')
  );

CREATE POLICY "bookings_host_update_limited" ON "Booking"
  FOR UPDATE USING (
    auth.uid() = (SELECT "hostId" FROM "Charger" WHERE id = "chargerId")
  )
  WITH CHECK (
    auth.uid() = (SELECT "hostId" FROM "Charger" WHERE id = "chargerId")
    AND status IN ('pending', 'confirmed', 'declined')
  );

-- Mobile mutates bookings through tRPC so Stripe, queues, and notifications
-- run in one server transaction. Do not leave PostgREST column grants that let
-- a direct client write server-managed payment/session fields.
REVOKE INSERT, UPDATE, DELETE ON "Booking" FROM anon, authenticated;

-- Chat participants may only mark readAt, not rewrite message bodies.
REVOKE UPDATE ON "ChatMessage" FROM authenticated;
GRANT UPDATE("readAt") ON "ChatMessage" TO authenticated;

-- Published chargers are readable, but end-user DB roles must never receive
-- gate/access codes or OCPP credential material.
REVOKE SELECT ON "Charger" FROM anon, authenticated;
GRANT SELECT (
  id, "hostId", title, "photoUrl", "addressLine1", city, state, "postalCode",
  country, lat, lng, "connectorType", "powerKw", "hardwareTier",
  "pricePerKwhCents", "pricePerHourCents", "houseRules", status,
  "instantAvailable", published, "ocppConnectedAt", availability,
  "createdAt", "updatedAt"
) ON "Charger" TO anon, authenticated;

-- Server-only tables: backend services use service_role/direct Postgres, so
-- client roles get no direct access.
ALTER TABLE "IdentityVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StripeWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShellDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChargerWaitlist" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "IdentityVerification" FROM anon, authenticated;
REVOKE ALL ON "StripeWebhookEvent" FROM anon, authenticated;
REVOKE ALL ON "ShellDevice" FROM anon, authenticated;
REVOKE ALL ON "ChargerWaitlist" FROM anon, authenticated;

-- Tables with party read policies are still server-written.
REVOKE INSERT, UPDATE, DELETE ON "Payout" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON "ChargingSession" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON "MeterValue" FROM anon, authenticated;
REVOKE UPDATE, DELETE ON "Review" FROM anon, authenticated;
