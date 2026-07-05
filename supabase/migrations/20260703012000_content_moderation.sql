-- App-store UGC safety support: users can block another user and report chat
-- messages, reviews, or profiles. The mobile app reaches these through tRPC;
-- direct client DB roles should not manage moderation rows.

CREATE TABLE IF NOT EXISTS "UserBlock" (
  "blockerId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "blockedId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId", "blockedId"),
  CONSTRAINT "UserBlock_no_self_block" CHECK ("blockerId" <> "blockedId")
);

CREATE INDEX IF NOT EXISTS "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

CREATE TABLE IF NOT EXISTS "ContentReport" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporterId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "targetUserId" uuid REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "messageId" uuid REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "reviewId" uuid REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "targetType" text NOT NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentReport_targetType_check"
    CHECK ("targetType" IN ('chat_message', 'review', 'user')),
  CONSTRAINT "ContentReport_status_check"
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  CONSTRAINT "ContentReport_reason_check"
    CHECK (char_length(reason) BETWEEN 1 AND 80),
  CONSTRAINT "ContentReport_one_target_check"
    CHECK (
      ("targetType" = 'chat_message' AND "reviewId" IS NULL)
      OR ("targetType" = 'review' AND "messageId" IS NULL)
      OR ("targetType" = 'user' AND "messageId" IS NULL AND "reviewId" IS NULL)
    )
);

ALTER TABLE "ContentReport"
  DROP CONSTRAINT IF EXISTS "ContentReport_one_target_check",
  DROP CONSTRAINT IF EXISTS "ContentReport_targetUserId_fkey",
  DROP CONSTRAINT IF EXISTS "ContentReport_messageId_fkey",
  DROP CONSTRAINT IF EXISTS "ContentReport_reviewId_fkey";

ALTER TABLE "ContentReport"
  ADD CONSTRAINT "ContentReport_one_target_check"
    CHECK (
      ("targetType" = 'chat_message' AND "reviewId" IS NULL)
      OR ("targetType" = 'review' AND "messageId" IS NULL)
      OR ("targetType" = 'user' AND "messageId" IS NULL AND "reviewId" IS NULL)
    ),
  ADD CONSTRAINT "ContentReport_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ContentReport_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ContentReport_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ContentReport_reporterId_createdAt_idx"
  ON "ContentReport"("reporterId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContentReport_targetUserId_createdAt_idx"
  ON "ContentReport"("targetUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContentReport_status_createdAt_idx"
  ON "ContentReport"(status, "createdAt");

ALTER TABLE "UserBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentReport" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "UserBlock" FROM anon, authenticated;
REVOKE ALL ON "ContentReport" FROM anon, authenticated;
