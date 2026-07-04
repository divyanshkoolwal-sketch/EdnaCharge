-- Add Charger to the supabase_realtime publication so the driver map's
-- postgres_changes subscription fires (a newly published charger shows up within
-- ~1s). The map handler only INVALIDATES + refetches via the API (which applies
-- proper column filtering) — it never reads the realtime payload.
--
-- SECURITY: publish an EXPLICIT SAFE COLUMN LIST. Realtime enforces row RLS but
-- NOT column GRANTs, so publishing the whole table would stream the full row
-- image — including gateCode, ocppAuthHash, and ocppSecretEnc — to any
-- authenticated subscriber on the shipped anon key. Only non-sensitive columns
-- (enough to trigger a refetch) are published here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Charger'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE "Charger";
  END IF;
  ALTER PUBLICATION supabase_realtime
    ADD TABLE "Charger" (id, "hostId", published, status, lat, lng, "updatedAt");
END $$;
