-- Durable Founder SLA queue for sealed-session reopen requests.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SealedSessionReopenStatus') THEN
    CREATE TYPE "SealedSessionReopenStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SealedSessionReopenRequest" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institutionId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "requestedById" UUID,
  "reviewedById" UUID,
  "status" "SealedSessionReopenStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedStatus" "AcademicSessionStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "reviewReason" TEXT,
  "dueAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SealedSessionReopenRequest_pkey" PRIMARY KEY ("uuid")
);

CREATE INDEX IF NOT EXISTS "SealedSessionReopenRequest_institutionId_status_createdAt_idx"
  ON "SealedSessionReopenRequest"("institutionId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SealedSessionReopenRequest_sessionId_status_idx"
  ON "SealedSessionReopenRequest"("sessionId", "status");
CREATE INDEX IF NOT EXISTS "SealedSessionReopenRequest_dueAt_status_idx"
  ON "SealedSessionReopenRequest"("dueAt", "status");
CREATE INDEX IF NOT EXISTS "SealedSessionReopenRequest_requestedById_idx"
  ON "SealedSessionReopenRequest"("requestedById");
CREATE INDEX IF NOT EXISTS "SealedSessionReopenRequest_reviewedById_idx"
  ON "SealedSessionReopenRequest"("reviewedById");
CREATE UNIQUE INDEX IF NOT EXISTS "SealedSessionReopenRequest_one_open_per_session_idx"
  ON "SealedSessionReopenRequest"("sessionId")
  WHERE "status" = 'REQUESTED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SealedSessionReopenRequest_institutionId_fkey') THEN
    ALTER TABLE "SealedSessionReopenRequest"
      ADD CONSTRAINT "SealedSessionReopenRequest_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SealedSessionReopenRequest_sessionId_fkey') THEN
    ALTER TABLE "SealedSessionReopenRequest"
      ADD CONSTRAINT "SealedSessionReopenRequest_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SealedSessionReopenRequest_requestedById_fkey') THEN
    ALTER TABLE "SealedSessionReopenRequest"
      ADD CONSTRAINT "SealedSessionReopenRequest_requestedById_fkey"
      FOREIGN KEY ("requestedById") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SealedSessionReopenRequest_reviewedById_fkey') THEN
    ALTER TABLE "SealedSessionReopenRequest"
      ADD CONSTRAINT "SealedSessionReopenRequest_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
