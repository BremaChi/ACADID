-- v5 Transfer workflows and disputed rollover surfaces.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TransferRequestStatus') THEN
    CREATE TYPE "TransferRequestStatus" AS ENUM (
      'REQUESTED',
      'IN_REVIEW',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
      'COMPLETED',
      'DISPUTED'
    );
  END IF;
END $$;

ALTER TABLE "RolloverRecord"
  ADD COLUMN IF NOT EXISTS "disputeId" UUID,
  ADD COLUMN IF NOT EXISTS "disputedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disputeResolutionNote" TEXT;

CREATE TABLE IF NOT EXISTS "TransferRequest" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "transferId" TEXT NOT NULL,
  "learnerId" UUID NOT NULL,
  "fromInstitutionId" UUID NOT NULL,
  "toInstitutionId" UUID,
  "fromEnrolmentId" UUID,
  "fromSessionId" UUID,
  "fromStructureId" UUID,
  "toInstitutionNameSubmitted" TEXT,
  "toInstitutionContactEmail" TEXT,
  "reason" TEXT,
  "status" "TransferRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedById" UUID,
  "reviewedById" UUID,
  "rolloverRecordId" UUID,
  "disputeId" UUID,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "notes" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransferRequest_pkey" PRIMARY KEY ("uuid")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RolloverRecord_disputeId_key" ON "RolloverRecord"("disputeId");
CREATE INDEX IF NOT EXISTS "RolloverRecord_disputeId_idx" ON "RolloverRecord"("disputeId");

CREATE UNIQUE INDEX IF NOT EXISTS "TransferRequest_transferId_key" ON "TransferRequest"("transferId");
CREATE UNIQUE INDEX IF NOT EXISTS "TransferRequest_rolloverRecordId_key" ON "TransferRequest"("rolloverRecordId");
CREATE UNIQUE INDEX IF NOT EXISTS "TransferRequest_disputeId_key" ON "TransferRequest"("disputeId");
CREATE INDEX IF NOT EXISTS "TransferRequest_fromInstitutionId_status_createdAt_idx" ON "TransferRequest"("fromInstitutionId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "TransferRequest_toInstitutionId_status_createdAt_idx" ON "TransferRequest"("toInstitutionId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "TransferRequest_learnerId_createdAt_idx" ON "TransferRequest"("learnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "TransferRequest_fromEnrolmentId_status_idx" ON "TransferRequest"("fromEnrolmentId", "status");
CREATE INDEX IF NOT EXISTS "TransferRequest_fromSessionId_status_idx" ON "TransferRequest"("fromSessionId", "status");
CREATE INDEX IF NOT EXISTS "TransferRequest_fromStructureId_idx" ON "TransferRequest"("fromStructureId");
CREATE INDEX IF NOT EXISTS "TransferRequest_requestedById_idx" ON "TransferRequest"("requestedById");
CREATE INDEX IF NOT EXISTS "TransferRequest_reviewedById_idx" ON "TransferRequest"("reviewedById");
CREATE INDEX IF NOT EXISTS "TransferRequest_disputeId_idx" ON "TransferRequest"("disputeId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolloverRecord_disputeId_fkey') THEN
    ALTER TABLE "RolloverRecord"
      ADD CONSTRAINT "RolloverRecord_disputeId_fkey"
      FOREIGN KEY ("disputeId") REFERENCES "Dispute"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferRequest_learnerId_fkey') THEN
    ALTER TABLE "TransferRequest"
      ADD CONSTRAINT "TransferRequest_learnerId_fkey"
      FOREIGN KEY ("learnerId") REFERENCES "Learner"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferRequest_fromInstitutionId_fkey') THEN
    ALTER TABLE "TransferRequest"
      ADD CONSTRAINT "TransferRequest_fromInstitutionId_fkey"
      FOREIGN KEY ("fromInstitutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferRequest_toInstitutionId_fkey') THEN
    ALTER TABLE "TransferRequest"
      ADD CONSTRAINT "TransferRequest_toInstitutionId_fkey"
      FOREIGN KEY ("toInstitutionId") REFERENCES "Institution"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferRequest_fromEnrolmentId_fkey') THEN
    ALTER TABLE "TransferRequest"
      ADD CONSTRAINT "TransferRequest_fromEnrolmentId_fkey"
      FOREIGN KEY ("fromEnrolmentId") REFERENCES "Enrolment"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferRequest_fromSessionId_fkey') THEN
    ALTER TABLE "TransferRequest"
      ADD CONSTRAINT "TransferRequest_fromSessionId_fkey"
      FOREIGN KEY ("fromSessionId") REFERENCES "AcademicSession"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferRequest_fromStructureId_fkey') THEN
    ALTER TABLE "TransferRequest"
      ADD CONSTRAINT "TransferRequest_fromStructureId_fkey"
      FOREIGN KEY ("fromStructureId") REFERENCES "AcademicStructure"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferRequest_requestedById_fkey') THEN
    ALTER TABLE "TransferRequest"
      ADD CONSTRAINT "TransferRequest_requestedById_fkey"
      FOREIGN KEY ("requestedById") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferRequest_reviewedById_fkey') THEN
    ALTER TABLE "TransferRequest"
      ADD CONSTRAINT "TransferRequest_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferRequest_rolloverRecordId_fkey') THEN
    ALTER TABLE "TransferRequest"
      ADD CONSTRAINT "TransferRequest_rolloverRecordId_fkey"
      FOREIGN KEY ("rolloverRecordId") REFERENCES "RolloverRecord"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferRequest_disputeId_fkey') THEN
    ALTER TABLE "TransferRequest"
      ADD CONSTRAINT "TransferRequest_disputeId_fkey"
      FOREIGN KEY ("disputeId") REFERENCES "Dispute"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
