-- Role-specific app access gate: invite codes, redemption audit, role grants,
-- and the app-level waitlist. This is separate from ChargerWaitlist, which is
-- only for non-OCPP hardware leads.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccessGrantSource') THEN
    CREATE TYPE "AccessGrantSource" AS ENUM ('invite_code', 'manual', 'backfill');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "InviteCode" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "codeHash" text NOT NULL UNIQUE,
  role "Role" NOT NULL,
  campaign text NOT NULL,
  "maxRedemptions" integer NOT NULL DEFAULT 1,
  "redeemedCount" integer NOT NULL DEFAULT 0,
  "expiresAt" timestamptz,
  "disabledAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "InviteCode_maxRedemptions_check" CHECK ("maxRedemptions" > 0),
  CONSTRAINT "InviteCode_redeemedCount_check" CHECK ("redeemedCount" >= 0)
);

CREATE INDEX IF NOT EXISTS "InviteCode_role_campaign_idx"
  ON "InviteCode" (role, campaign);
CREATE INDEX IF NOT EXISTS "InviteCode_disabledAt_expiresAt_idx"
  ON "InviteCode" ("disabledAt", "expiresAt");

CREATE TABLE IF NOT EXISTS "InviteRedemption" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "inviteCodeId" uuid NOT NULL REFERENCES "InviteCode"(id) ON DELETE CASCADE,
  role "Role" NOT NULL,
  "redeemedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", "inviteCodeId")
);

CREATE INDEX IF NOT EXISTS "InviteRedemption_userId_role_idx"
  ON "InviteRedemption" ("userId", role);

CREATE TABLE IF NOT EXISTS "UserAccessGrant" (
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role "Role" NOT NULL,
  source "AccessGrantSource" NOT NULL,
  "inviteCodeId" uuid REFERENCES "InviteCode"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", role)
);

CREATE INDEX IF NOT EXISTS "UserAccessGrant_role_idx"
  ON "UserAccessGrant" (role);
CREATE INDEX IF NOT EXISTS "UserAccessGrant_inviteCodeId_idx"
  ON "UserAccessGrant" ("inviteCodeId");

CREATE TABLE IF NOT EXISTS "AppWaitlistEntry" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role "Role" NOT NULL,
  city text NOT NULL,
  "postalCode" text NOT NULL,
  phone text,
  source text,
  campaign text,
  "chargerBrand" text,
  "hasOcpp" boolean,
  notes text,
  status text NOT NULL DEFAULT 'open',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", role)
);

CREATE INDEX IF NOT EXISTS "AppWaitlistEntry_role_status_createdAt_idx"
  ON "AppWaitlistEntry" (role, status, "createdAt");

INSERT INTO "UserAccessGrant" ("userId", role, source)
SELECT id, 'host'::"Role", 'backfill'::"AccessGrantSource"
FROM "User"
WHERE 'host' = ANY(roles)
   OR EXISTS (SELECT 1 FROM "HostProfile" hp WHERE hp."userId" = "User".id)
ON CONFLICT ("userId", role) DO NOTHING;

INSERT INTO "UserAccessGrant" ("userId", role, source)
SELECT id, 'driver'::"Role", 'backfill'::"AccessGrantSource"
FROM "User"
WHERE EXISTS (SELECT 1 FROM "DriverProfile" dp WHERE dp."userId" = "User".id)
   OR EXISTS (SELECT 1 FROM "Booking" b WHERE b."driverId" = "User".id)
ON CONFLICT ("userId", role) DO NOTHING;

ALTER TABLE "InviteCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InviteRedemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserAccessGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppWaitlistEntry" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "InviteCode" FROM anon, authenticated;
REVOKE ALL ON "InviteRedemption" FROM anon, authenticated;
REVOKE ALL ON "UserAccessGrant" FROM anon, authenticated;
REVOKE ALL ON "AppWaitlistEntry" FROM anon, authenticated;
