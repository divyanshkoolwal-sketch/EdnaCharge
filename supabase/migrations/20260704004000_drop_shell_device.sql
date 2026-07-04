-- Remove the orphaned ShellDevice table + DeviceStatus enum. The Tier 1/Tier 2
-- Shelly device feature (drivers, MQTT client, device jobs, device router) was
-- deleted; EdnaCharge v1 is OCPP-only. The table is unused (no code references).
DROP TABLE IF EXISTS "ShellDevice" CASCADE;
DROP TYPE IF EXISTS "DeviceStatus";
