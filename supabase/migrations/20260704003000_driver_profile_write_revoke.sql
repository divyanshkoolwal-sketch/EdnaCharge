-- RLS hardening: revoke direct client-role writes on DriverProfile, matching the
-- treatment of User / HostProfile / Charger / Booking. All writes go through the
-- API (service role); the mobile client only ever reads its own row.
REVOKE INSERT, UPDATE, DELETE ON "DriverProfile" FROM anon, authenticated;
