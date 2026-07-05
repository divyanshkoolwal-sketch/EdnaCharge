-- Core Prisma schema baseline for clean local Supabase databases.
-- Later feature migrations add ShellDevice, ChargerWaitlist, Notification, and
-- moderation tables plus RLS policies. Without this baseline, a fresh
-- `supabase start` applies 20260501000000_shell_device.sql before "Charger"
-- exists and local CI/e2e setup cannot boot.

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('driver', 'host');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConnectorType" AS ENUM ('j1772', 'nacs', 'tesla', 'ccs1', 'chademo');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "HardwareTier" AS ENUM (
    'tier_1_smart_plug',
    'tier_2_bridge_kit',
    'tier_3_native',
    'tier_4_unmetered'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM (
    'pending',
    'confirmed',
    'declined',
    'cancelled',
    'active',
    'completed',
    'no_show',
    'errored'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ChargerStatus" AS ENUM ('offline', 'available', 'occupied', 'faulted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MessageKind" AS ENUM ('text', 'system');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'paid', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "VerificationStatus" AS ENUM (
    'unstarted',
    'processing',
    'requires_input',
    'verified',
    'canceled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" UUID NOT NULL,
  "firebaseUid" TEXT,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "fullName" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "roles" "Role"[] DEFAULT ARRAY['driver']::"Role"[],
  "expoPushToken" TEXT,
  "stripeCustomerId" TEXT,
  "defaultPaymentMethodId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DriverProfile" (
  "userId" UUID NOT NULL,
  "vehicleMake" TEXT NOT NULL,
  "vehicleModel" TEXT NOT NULL,
  "vehicleYear" INTEGER NOT NULL,
  "connectorType" "ConnectorType" NOT NULL,
  "licensePlate" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "HostProfile" (
  "userId" UUID NOT NULL,
  "legalName" TEXT NOT NULL,
  "dob" TIMESTAMP(3) NOT NULL,
  "addressLine1" TEXT NOT NULL,
  "addressLine2" TEXT,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'US',
  "stripeAccountId" TEXT,
  "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
  "hardwareSetup" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HostProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "Charger" (
  "id" UUID NOT NULL,
  "hostId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "photoUrl" TEXT,
  "addressLine1" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'US',
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "location" geography(Point,4326),
  "connectorType" "ConnectorType" NOT NULL,
  "powerKw" DOUBLE PRECISION NOT NULL,
  "hardwareTier" "HardwareTier" NOT NULL,
  "pricePerKwhCents" INTEGER,
  "pricePerHourCents" INTEGER,
  "houseRules" TEXT,
  "gateCode" TEXT,
  "status" "ChargerStatus" NOT NULL DEFAULT 'offline',
  "instantAvailable" BOOLEAN NOT NULL DEFAULT false,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "ocppChargePointId" TEXT,
  "ocppAuthHash" TEXT,
  "ocppSecretEnc" TEXT,
  "ocppConnectedAt" TIMESTAMP(3),
  "availability" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Charger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Booking" (
  "id" UUID NOT NULL,
  "chargerId" UUID NOT NULL,
  "driverId" UUID NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'pending',
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "estimatedKwh" DOUBLE PRECISION NOT NULL,
  "estimatedCostCents" INTEGER NOT NULL,
  "platformFeeCents" INTEGER NOT NULL,
  "ratePerKwhCents" INTEGER,
  "driverMessage" TEXT,
  "declineReason" TEXT,
  "stripePaymentIntentId" TEXT,
  "preauthAmountCents" INTEGER NOT NULL,
  "capturedAmountCents" INTEGER,
  "ocppStartToken" TEXT,
  "ocppAuthorizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "autoDeclineAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChargingSession" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "chargerId" UUID NOT NULL,
  "ocppTransactionId" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "meterStartWh" INTEGER NOT NULL DEFAULT 0,
  "meterStopWh" INTEGER,
  "finalKwh" DOUBLE PRECISION,
  "finalCostCents" INTEGER,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChargingSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MeterValue" (
  "id" BIGSERIAL NOT NULL,
  "sessionId" UUID NOT NULL,
  "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "energyWh" INTEGER NOT NULL,
  "powerW" INTEGER NOT NULL,
  "voltageV" DOUBLE PRECISION,
  "currentA" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeterValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatThread" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" UUID NOT NULL,
  "threadId" UUID NOT NULL,
  "senderId" UUID,
  "kind" "MessageKind" NOT NULL DEFAULT 'text',
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Review" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "subjectId" UUID NOT NULL,
  "stars" INTEGER NOT NULL,
  "text" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Payout" (
  "id" UUID NOT NULL,
  "hostId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "grossCents" INTEGER NOT NULL,
  "platformFeeCents" INTEGER NOT NULL,
  "netCents" INTEGER NOT NULL,
  "stripeTransferId" TEXT,
  "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IdentityVerification" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "stripeVerificationSessionId" TEXT,
  "status" "VerificationStatus" NOT NULL DEFAULT 'unstarted',
  "documentType" TEXT,
  "verifiedName" TEXT,
  "verifiedDob" TIMESTAMP(3),
  "verifiedAddress" JSONB,
  "documentLast4" TEXT,
  "documentExpiresOn" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_firebaseUid_key" ON "User"("firebaseUid");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_firebaseUid_idx" ON "User"("firebaseUid");

CREATE UNIQUE INDEX IF NOT EXISTS "Charger_ocppChargePointId_key" ON "Charger"("ocppChargePointId");
CREATE INDEX IF NOT EXISTS "Charger_hostId_idx" ON "Charger"("hostId");
CREATE INDEX IF NOT EXISTS "Charger_status_idx" ON "Charger"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "Booking_stripePaymentIntentId_key" ON "Booking"("stripePaymentIntentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_ocppStartToken_key" ON "Booking"("ocppStartToken");
CREATE INDEX IF NOT EXISTS "Booking_driverId_status_idx" ON "Booking"("driverId", "status");
CREATE INDEX IF NOT EXISTS "Booking_chargerId_status_idx" ON "Booking"("chargerId", "status");
CREATE INDEX IF NOT EXISTS "Booking_autoDeclineAt_idx" ON "Booking"("autoDeclineAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ChargingSession_bookingId_key" ON "ChargingSession"("bookingId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChargingSession_ocppTransactionId_key" ON "ChargingSession"("ocppTransactionId");
CREATE INDEX IF NOT EXISTS "ChargingSession_chargerId_idx" ON "ChargingSession"("chargerId");

CREATE INDEX IF NOT EXISTS "MeterValue_sessionId_ts_idx" ON "MeterValue"("sessionId", "ts");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatThread_bookingId_key" ON "ChatThread"("bookingId");
CREATE INDEX IF NOT EXISTS "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

CREATE INDEX IF NOT EXISTS "Review_subjectId_idx" ON "Review"("subjectId");
CREATE UNIQUE INDEX IF NOT EXISTS "Review_bookingId_authorId_key" ON "Review"("bookingId", "authorId");

CREATE UNIQUE INDEX IF NOT EXISTS "Payout_bookingId_key" ON "Payout"("bookingId");
CREATE INDEX IF NOT EXISTS "Payout_hostId_status_idx" ON "Payout"("hostId", "status");

CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_type_idx" ON "StripeWebhookEvent"("type");

CREATE UNIQUE INDEX IF NOT EXISTS "IdentityVerification_userId_key"
  ON "IdentityVerification"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "IdentityVerification_stripeVerificationSessionId_key"
  ON "IdentityVerification"("stripeVerificationSessionId");
CREATE INDEX IF NOT EXISTS "IdentityVerification_status_idx" ON "IdentityVerification"("status");

DO $$ BEGIN
  ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "HostProfile" ADD CONSTRAINT "HostProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Charger" ADD CONSTRAINT "Charger_hostId_fkey"
    FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_chargerId_fkey"
    FOREIGN KEY ("chargerId") REFERENCES "Charger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_chargerId_fkey"
    FOREIGN KEY ("chargerId") REFERENCES "Charger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "MeterValue" ADD CONSTRAINT "MeterValue_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ChargingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Payout" ADD CONSTRAINT "Payout_hostId_fkey"
    FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Payout" ADD CONSTRAINT "Payout_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
