-- Row-Level Security policies for EdnaCharge.
-- Applied manually via `supabase db push` after `prisma migrate dev` runs Prisma's DDL.
-- Spec: PRD §13 + chat extensions from §10.
--
-- Assumptions:
--   * auth.uid() returns the authenticated user's uuid (Supabase convention).
--   * service_role bypasses RLS — used by apps/worker and apps/csms.
--   * The API uses the user's JWT, so auth.uid() reflects the caller.

-- ---------- USERS ----------
alter table "User" enable row level security;
create policy "users_read_self" on "User"
  for select using (auth.uid() = id);
create policy "users_update_self" on "User"
  for update using (auth.uid() = id);

-- ---------- DRIVER / HOST PROFILES ----------
alter table "DriverProfile" enable row level security;
create policy "driver_profile_self" on "DriverProfile"
  for all using (auth.uid() = "userId") with check (auth.uid() = "userId");

alter table "HostProfile" enable row level security;
create policy "host_profile_self" on "HostProfile"
  for all using (auth.uid() = "userId") with check (auth.uid() = "userId");

-- ---------- CHARGERS ----------
alter table "Charger" enable row level security;
-- Drivers can see published chargers on the map.
create policy "chargers_read_published" on "Charger"
  for select using (published = true);
-- Hosts can read/write their own chargers (published or not).
create policy "chargers_host_all" on "Charger"
  for all using (auth.uid() = "hostId") with check (auth.uid() = "hostId");

-- ---------- BOOKINGS ----------
alter table "Booking" enable row level security;
-- Driver or host (via charger) can read their own bookings.
create policy "bookings_read_party" on "Booking"
  for select using (
    auth.uid() = "driverId"
    or auth.uid() = (select "hostId" from "Charger" where id = "chargerId")
  );
-- Driver creates requests; only on bookings they own.
create policy "bookings_driver_insert" on "Booking"
  for insert with check (auth.uid() = "driverId");
-- Both parties can update bookings they participate in (server-side tRPC enforces
-- which transitions each role may perform — this policy just limits who can touch
-- the row at all).
create policy "bookings_update_party" on "Booking"
  for update using (
    auth.uid() = "driverId"
    or auth.uid() = (select "hostId" from "Charger" where id = "chargerId")
  );

-- ---------- CHARGING SESSIONS + METER VALUES ----------
alter table "ChargingSession" enable row level security;
create policy "sessions_read_party" on "ChargingSession"
  for select using (
    auth.uid() = (select "driverId" from "Booking" where id = "bookingId")
    or auth.uid() = (select "hostId" from "Charger" where id = "chargerId")
  );

alter table "MeterValue" enable row level security;
create policy "meter_values_read_party" on "MeterValue"
  for select using (
    auth.uid() = (
      select b."driverId"
      from "ChargingSession" s
      join "Booking" b on b.id = s."bookingId"
      where s.id = "sessionId"
    )
    or auth.uid() = (
      select c."hostId"
      from "ChargingSession" s
      join "Charger" c on c.id = s."chargerId"
      where s.id = "sessionId"
    )
  );

-- ---------- CHAT ----------
alter table "ChatThread" enable row level security;
create policy "chat_threads_read_party" on "ChatThread"
  for select using (
    auth.uid() = (select "driverId" from "Booking" where id = "bookingId")
    or auth.uid() = (
      select ch."hostId"
      from "Booking" b
      join "Charger" ch on ch.id = b."chargerId"
      where b.id = "bookingId"
    )
  );

alter table "ChatMessage" enable row level security;
-- Read: same party predicate via the thread.
create policy "chat_messages_read_party" on "ChatMessage"
  for select using (
    exists (
      select 1 from "ChatThread" t
      join "Booking" b on b.id = t."bookingId"
      left join "Charger" ch on ch.id = b."chargerId"
      where t.id = "threadId"
        and (auth.uid() = b."driverId" or auth.uid() = ch."hostId")
    )
  );
-- Insert: sender must be the authenticated user AND a party to the booking.
create policy "chat_messages_insert_party" on "ChatMessage"
  for insert with check (
    "senderId" = auth.uid()
    and exists (
      select 1 from "ChatThread" t
      join "Booking" b on b.id = t."bookingId"
      left join "Charger" ch on ch.id = b."chargerId"
      where t.id = "threadId"
        and (auth.uid() = b."driverId" or auth.uid() = ch."hostId")
    )
  );
-- Update: only to set readAt on messages the user received.
create policy "chat_messages_mark_read" on "ChatMessage"
  for update using (
    "senderId" is distinct from auth.uid()
    and exists (
      select 1 from "ChatThread" t
      join "Booking" b on b.id = t."bookingId"
      left join "Charger" ch on ch.id = b."chargerId"
      where t.id = "threadId"
        and (auth.uid() = b."driverId" or auth.uid() = ch."hostId")
    )
  );

-- ---------- REVIEWS ----------
alter table "Review" enable row level security;
create policy "reviews_read_any" on "Review" for select using (true);
create policy "reviews_author_insert" on "Review"
  for insert with check (auth.uid() = "authorId");

-- ---------- PAYOUTS ----------
alter table "Payout" enable row level security;
create policy "payouts_read_host" on "Payout"
  for select using (auth.uid() = "hostId");

-- Trigger: maintain Charger.location geography column from lat/lng.
create or replace function charger_sync_location() returns trigger as $$
begin
  new.location := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  return new;
end
$$ language plpgsql;

drop trigger if exists charger_sync_location_ins on "Charger";
create trigger charger_sync_location_ins
before insert or update of lat, lng on "Charger"
for each row execute function charger_sync_location();

-- Spatial index for map queries.
create index if not exists charger_location_gix on "Charger" using gist (location);
