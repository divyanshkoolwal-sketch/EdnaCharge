-- Keep the PostGIS geography column in sync with Prisma-managed lat/lng.
-- charger.nearby uses this column for radius searches; without the trigger,
-- chargers created through Prisma have NULL location and disappear from the map.

CREATE OR REPLACE FUNCTION charger_sync_location() RETURNS trigger AS $$
BEGIN
  NEW.location := st_setsrid(st_makepoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS charger_sync_location_ins ON "Charger";
CREATE TRIGGER charger_sync_location_ins
BEFORE INSERT OR UPDATE OF lat, lng ON "Charger"
FOR EACH ROW EXECUTE FUNCTION charger_sync_location();

UPDATE "Charger"
SET lat = lat
WHERE location IS NULL;

CREATE INDEX IF NOT EXISTS charger_location_gix ON "Charger" USING gist (location);
