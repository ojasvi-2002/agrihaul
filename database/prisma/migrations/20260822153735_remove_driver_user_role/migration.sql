-- AlterEnum
-- Drivers never get a platform login (same as farmers) — the separate
-- Driver model is the real driver concept, SMS-only. No existing User
-- or TeamInvite row used DRIVER, confirmed before writing this migration.
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('OWNER', 'ADMIN', 'DISPATCHER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TABLE "TeamInvite" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
COMMIT;
