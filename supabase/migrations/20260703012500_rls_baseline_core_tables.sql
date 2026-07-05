-- Baseline RLS policies for core app tables. RLS policy source of truth is migrations.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_self" ON "User";
CREATE POLICY "users_read_self" ON "User"
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "users_update_self" ON "User";
CREATE POLICY "users_update_self" ON "User"
  FOR UPDATE USING (auth.uid() = id);
REVOKE INSERT, UPDATE, DELETE ON "User" FROM anon, authenticated;
GRANT UPDATE("fullName") ON "User" TO authenticated;

ALTER TABLE "DriverProfile" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_profile_self" ON "DriverProfile";
CREATE POLICY "driver_profile_self" ON "DriverProfile"
  FOR ALL USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");

ALTER TABLE "HostProfile" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "host_profile_self" ON "HostProfile";
CREATE POLICY "host_profile_self" ON "HostProfile"
  FOR ALL USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");

ALTER TABLE "Charger" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chargers_read_published" ON "Charger";
CREATE POLICY "chargers_read_published" ON "Charger"
  FOR SELECT USING (published = true);
DROP POLICY IF EXISTS "chargers_host_all" ON "Charger";
CREATE POLICY "chargers_host_all" ON "Charger"
  FOR ALL USING (auth.uid() = "hostId") WITH CHECK (auth.uid() = "hostId");

ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bookings_read_party" ON "Booking";
CREATE POLICY "bookings_read_party" ON "Booking"
  FOR SELECT USING (
    auth.uid() = "driverId"
    OR auth.uid() = (SELECT "hostId" FROM "Charger" WHERE id = "chargerId")
  );
DROP POLICY IF EXISTS "bookings_driver_insert" ON "Booking";
CREATE POLICY "bookings_driver_insert" ON "Booking"
  FOR INSERT WITH CHECK (auth.uid() = "driverId");
DROP POLICY IF EXISTS "bookings_update_party" ON "Booking";

ALTER TABLE "ChargingSession" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions_read_party" ON "ChargingSession";
CREATE POLICY "sessions_read_party" ON "ChargingSession"
  FOR SELECT USING (
    auth.uid() = (SELECT "driverId" FROM "Booking" WHERE id = "bookingId")
    OR auth.uid() = (SELECT "hostId" FROM "Charger" WHERE id = "chargerId")
  );

ALTER TABLE "MeterValue" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meter_values_read_party" ON "MeterValue";
CREATE POLICY "meter_values_read_party" ON "MeterValue"
  FOR SELECT USING (
    auth.uid() = (
      SELECT b."driverId"
      FROM "ChargingSession" s
      JOIN "Booking" b ON b.id = s."bookingId"
      WHERE s.id = "sessionId"
    )
    OR auth.uid() = (
      SELECT c."hostId"
      FROM "ChargingSession" s
      JOIN "Charger" c ON c.id = s."chargerId"
      WHERE s.id = "sessionId"
    )
  );

ALTER TABLE "ChatThread" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_threads_read_party" ON "ChatThread";
CREATE POLICY "chat_threads_read_party" ON "ChatThread"
  FOR SELECT USING (
    auth.uid() = (SELECT "driverId" FROM "Booking" WHERE id = "bookingId")
    OR auth.uid() = (
      SELECT ch."hostId"
      FROM "Booking" b
      JOIN "Charger" ch ON ch.id = b."chargerId"
      WHERE b.id = "bookingId"
    )
  );

ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_messages_read_party" ON "ChatMessage";
CREATE POLICY "chat_messages_read_party" ON "ChatMessage"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "ChatThread" t
      JOIN "Booking" b ON b.id = t."bookingId"
      LEFT JOIN "Charger" ch ON ch.id = b."chargerId"
      WHERE t.id = "threadId"
        AND (auth.uid() = b."driverId" OR auth.uid() = ch."hostId")
    )
  );
DROP POLICY IF EXISTS "chat_messages_insert_party" ON "ChatMessage";
CREATE POLICY "chat_messages_insert_party" ON "ChatMessage"
  FOR INSERT WITH CHECK (
    "senderId" = auth.uid()
    AND EXISTS (
      SELECT 1 FROM "ChatThread" t
      JOIN "Booking" b ON b.id = t."bookingId"
      LEFT JOIN "Charger" ch ON ch.id = b."chargerId"
      WHERE t.id = "threadId"
        AND (auth.uid() = b."driverId" OR auth.uid() = ch."hostId")
    )
  );
DROP POLICY IF EXISTS "chat_messages_mark_read" ON "ChatMessage";
CREATE POLICY "chat_messages_mark_read" ON "ChatMessage"
  FOR UPDATE USING (
    "senderId" IS DISTINCT FROM auth.uid()
    AND EXISTS (
      SELECT 1 FROM "ChatThread" t
      JOIN "Booking" b ON b.id = t."bookingId"
      LEFT JOIN "Charger" ch ON ch.id = b."chargerId"
      WHERE t.id = "threadId"
        AND (auth.uid() = b."driverId" OR auth.uid() = ch."hostId")
    )
  );

ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reviews_read_any" ON "Review";
CREATE POLICY "reviews_read_any" ON "Review"
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "reviews_author_insert" ON "Review";
CREATE POLICY "reviews_author_insert" ON "Review"
  FOR INSERT WITH CHECK (auth.uid() = "authorId");

ALTER TABLE "Payout" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payouts_read_host" ON "Payout";
CREATE POLICY "payouts_read_host" ON "Payout"
  FOR SELECT USING (auth.uid() = "hostId");
