-- Reversible OCPP credential storage.
-- Stores the charger's OCPP password symmetrically encrypted (pgcrypto
-- pgp_sym_encrypt, base64) in addition to the bcrypt hash, so the host can
-- re-view the SAME credentials without rotating them (rotation is explicit).
-- Applied automatically by `supabase db reset` or `prisma db push`.

ALTER TABLE "Charger" ADD COLUMN IF NOT EXISTS "ocppSecretEnc" TEXT;
