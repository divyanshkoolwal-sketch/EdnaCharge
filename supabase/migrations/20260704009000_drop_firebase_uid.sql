-- Drop the dead `firebaseUid` column. Auth migrated from Firebase → Supabase
-- (PR #24): `User.id` IS the Supabase auth user id now, so `firebaseUid` is no
-- longer read or written by any code path. Removing the column + its indexes.
DROP INDEX IF EXISTS "User_firebaseUid_idx";
DROP INDEX IF EXISTS "User_firebaseUid_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "firebaseUid";
