-- Anti-theft OCPP start authorization.
-- The driver tapping "Start charging" mints a one-time idTag (ocppStartToken)
-- and stamps ocppAuthorizedAt. The CSMS authorizes an OCPP Authorize /
-- StartTransaction ONLY when the charger presents that exact token inside the
-- window, so energy can never flow (or be billed) for a session the driver
-- didn't explicitly start. Applied by `supabase db reset` or `prisma db push`.

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "ocppStartToken" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "ocppAuthorizedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_ocppStartToken_key" ON "Booking"("ocppStartToken");
