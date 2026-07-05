-- Keep notification deep links referentially valid. Notifications remain as a
-- historical feed row, but stale booking/thread/session pointers are nulled if
-- the target row is deleted.

ALTER TABLE "Notification"
  DROP CONSTRAINT IF EXISTS "Notification_bookingId_fkey",
  DROP CONSTRAINT IF EXISTS "Notification_threadId_fkey",
  DROP CONSTRAINT IF EXISTS "Notification_sessionId_fkey";

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Notification_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Notification_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ChargingSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
