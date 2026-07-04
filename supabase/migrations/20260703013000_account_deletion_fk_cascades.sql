-- Keep database FK behavior aligned with Prisma schema so in-app account
-- deletion can remove users that have chat messages, reviews, or payouts.

ALTER TABLE "ChatMessage"
  DROP CONSTRAINT IF EXISTS "ChatMessage_senderId_fkey",
  ADD CONSTRAINT "ChatMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Review"
  DROP CONSTRAINT IF EXISTS "Review_authorId_fkey",
  ADD CONSTRAINT "Review_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Review"
  DROP CONSTRAINT IF EXISTS "Review_subjectId_fkey",
  ADD CONSTRAINT "Review_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payout"
  DROP CONSTRAINT IF EXISTS "Payout_hostId_fkey",
  ADD CONSTRAINT "Payout_hostId_fkey"
    FOREIGN KEY ("hostId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payout"
  DROP CONSTRAINT IF EXISTS "Payout_bookingId_fkey",
  ADD CONSTRAINT "Payout_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
