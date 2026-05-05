-- v4 institution workspace human-user foundation.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'READ_ONLY';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'InstitutionUserStatus'
  ) THEN
    CREATE TYPE "InstitutionUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;

ALTER TABLE "InstitutionUser"
  ADD COLUMN IF NOT EXISTS "status" "InstitutionUserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "invitedById" UUID,
  ADD COLUMN IF NOT EXISTS "inviteTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inviteExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inviteAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InstitutionUser_invitedById_fkey'
  ) THEN
    ALTER TABLE "InstitutionUser"
      ADD CONSTRAINT "InstitutionUser_invitedById_fkey"
      FOREIGN KEY ("invitedById") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "InstitutionUser_inviteTokenHash_key" ON "InstitutionUser"("inviteTokenHash");
CREATE INDEX IF NOT EXISTS "InstitutionUser_institutionId_status_idx" ON "InstitutionUser"("institutionId", "status");
CREATE INDEX IF NOT EXISTS "InstitutionUser_userId_status_idx" ON "InstitutionUser"("userId", "status");
CREATE INDEX IF NOT EXISTS "InstitutionUser_inviteTokenHash_idx" ON "InstitutionUser"("inviteTokenHash");
