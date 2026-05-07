-- v5 academic operations foundation: sessions, structures, scoped staff, richer batches, and rollovers.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DEPARTMENTAL_OFFICER';

ALTER TYPE "EnrolmentStatus" ADD VALUE IF NOT EXISTS 'PENDING_ROLLOVER';
ALTER TYPE "EnrolmentStatus" ADD VALUE IF NOT EXISTS 'PROMOTED';
ALTER TYPE "EnrolmentStatus" ADD VALUE IF NOT EXISTS 'REPEATED';
ALTER TYPE "EnrolmentStatus" ADD VALUE IF NOT EXISTS 'TRANSFERRED_OUT';
ALTER TYPE "EnrolmentStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';
ALTER TYPE "EnrolmentStatus" ADD VALUE IF NOT EXISTS 'GRADUATED';
ALTER TYPE "EnrolmentStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "EnrolmentStatus" ADD VALUE IF NOT EXISTS 'SEALED';

ALTER TYPE "AcademicRecordStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "AcademicRecordStatus" ADD VALUE IF NOT EXISTS 'SEALED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AcademicSessionStatus') THEN
    CREATE TYPE "AcademicSessionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'SEALED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AcademicStructureType') THEN
    CREATE TYPE "AcademicStructureType" AS ENUM (
      'LEVEL',
      'CLASS',
      'ARM',
      'STREAM',
      'SUBJECT',
      'FACULTY',
      'DEPARTMENT',
      'PROGRAMME',
      'COURSE'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AcademicStructureStatus') THEN
    CREATE TYPE "AcademicStructureStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ResultUploadMode') THEN
    CREATE TYPE "ResultUploadMode" AS ENUM ('SUBJECT_BY_SUBJECT', 'MASTER_SHEET', 'COURSE_BASED', 'MANUAL_ENTRY');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RolloverDecision') THEN
    CREATE TYPE "RolloverDecision" AS ENUM (
      'PROMOTED',
      'REPEATED',
      'TRANSFERRED_OUT',
      'WITHDRAWN',
      'GRADUATED',
      'SUSPENDED',
      'SEALED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RolloverStatus') THEN
    CREATE TYPE "RolloverStatus" AS ENUM ('PENDING_ROLLOVER', 'APPROVED', 'CANCELLED');
  END IF;
END $$;

ALTER TABLE "InstitutionUser"
  ADD COLUMN IF NOT EXISTS "assignedScopes" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "AcademicSession" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institutionId" UUID NOT NULL,
  "sessionLabel" TEXT NOT NULL,
  "periodType" "PeriodType" NOT NULL,
  "periodLabel" TEXT NOT NULL,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "status" "AcademicSessionStatus" NOT NULL DEFAULT 'DRAFT',
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AcademicSession_pkey" PRIMARY KEY ("uuid")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AcademicSession_institutionId_sessionLabel_periodType_periodLabel_key"
  ON "AcademicSession"("institutionId", "sessionLabel", "periodType", "periodLabel");
CREATE INDEX IF NOT EXISTS "AcademicSession_institutionId_status_idx" ON "AcademicSession"("institutionId", "status");
CREATE INDEX IF NOT EXISTS "AcademicSession_institutionId_isCurrent_idx" ON "AcademicSession"("institutionId", "isCurrent");
CREATE INDEX IF NOT EXISTS "AcademicSession_createdById_idx" ON "AcademicSession"("createdById");

CREATE TABLE IF NOT EXISTS "AcademicStructure" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institutionId" UUID NOT NULL,
  "parentId" UUID,
  "type" "AcademicStructureType" NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "creditUnits" INTEGER,
  "metadata" JSONB,
  "status" "AcademicStructureStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AcademicStructure_pkey" PRIMARY KEY ("uuid")
);

CREATE INDEX IF NOT EXISTS "AcademicStructure_institutionId_type_status_idx" ON "AcademicStructure"("institutionId", "type", "status");
CREATE INDEX IF NOT EXISTS "AcademicStructure_institutionId_parentId_idx" ON "AcademicStructure"("institutionId", "parentId");
CREATE INDEX IF NOT EXISTS "AcademicStructure_code_idx" ON "AcademicStructure"("code");
CREATE INDEX IF NOT EXISTS "AcademicStructure_createdById_idx" ON "AcademicStructure"("createdById");

ALTER TABLE "Enrolment"
  ADD COLUMN IF NOT EXISTS "academicSessionId" UUID,
  ADD COLUMN IF NOT EXISTS "structureScopeId" UUID;

ALTER TABLE "ResultBatch"
  ADD COLUMN IF NOT EXISTS "academicSessionId" UUID,
  ADD COLUMN IF NOT EXISTS "structureScopeId" UUID,
  ADD COLUMN IF NOT EXISTS "uploadMode" "ResultUploadMode" NOT NULL DEFAULT 'MASTER_SHEET',
  ADD COLUMN IF NOT EXISTS "batchLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByInstitutionUserId" UUID,
  ADD COLUMN IF NOT EXISTS "reviewedByInstitutionUserId" UUID,
  ADD COLUMN IF NOT EXISTS "approvedByInstitutionUserId" UUID,
  ADD COLUMN IF NOT EXISTS "recordCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "validationSummary" JSONB,
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

ALTER TABLE "AcademicRecord"
  ADD COLUMN IF NOT EXISTS "academicSessionId" UUID,
  ADD COLUMN IF NOT EXISTS "structureScopeId" UUID;

CREATE TABLE IF NOT EXISTS "RolloverRecord" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institutionId" UUID NOT NULL,
  "learnerId" UUID NOT NULL,
  "enrolmentId" UUID,
  "fromSessionId" UUID NOT NULL,
  "toSessionId" UUID,
  "fromStructureId" UUID,
  "toStructureId" UUID,
  "decision" "RolloverDecision" NOT NULL,
  "status" "RolloverStatus" NOT NULL DEFAULT 'PENDING_ROLLOVER',
  "reason" TEXT,
  "createdById" UUID,
  "approvedById" UUID,
  "approvedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RolloverRecord_pkey" PRIMARY KEY ("uuid")
);

CREATE INDEX IF NOT EXISTS "Enrolment_institutionId_academicSessionId_status_idx" ON "Enrolment"("institutionId", "academicSessionId", "status");
CREATE INDEX IF NOT EXISTS "Enrolment_structureScopeId_status_idx" ON "Enrolment"("structureScopeId", "status");

CREATE INDEX IF NOT EXISTS "ResultBatch_institutionId_academicSessionId_status_idx" ON "ResultBatch"("institutionId", "academicSessionId", "status");
CREATE INDEX IF NOT EXISTS "ResultBatch_structureScopeId_status_idx" ON "ResultBatch"("structureScopeId", "status");
CREATE INDEX IF NOT EXISTS "ResultBatch_createdByInstitutionUserId_idx" ON "ResultBatch"("createdByInstitutionUserId");
CREATE INDEX IF NOT EXISTS "ResultBatch_reviewedByInstitutionUserId_idx" ON "ResultBatch"("reviewedByInstitutionUserId");
CREATE INDEX IF NOT EXISTS "ResultBatch_approvedByInstitutionUserId_idx" ON "ResultBatch"("approvedByInstitutionUserId");

CREATE INDEX IF NOT EXISTS "AcademicRecord_academicSessionId_status_idx" ON "AcademicRecord"("academicSessionId", "status");
CREATE INDEX IF NOT EXISTS "AcademicRecord_structureScopeId_status_idx" ON "AcademicRecord"("structureScopeId", "status");
CREATE INDEX IF NOT EXISTS "AcademicRecord_resultBatchId_status_idx" ON "AcademicRecord"("resultBatchId", "status");

CREATE INDEX IF NOT EXISTS "RolloverRecord_institutionId_status_idx" ON "RolloverRecord"("institutionId", "status");
CREATE INDEX IF NOT EXISTS "RolloverRecord_learnerId_createdAt_idx" ON "RolloverRecord"("learnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "RolloverRecord_fromSessionId_status_idx" ON "RolloverRecord"("fromSessionId", "status");
CREATE INDEX IF NOT EXISTS "RolloverRecord_toSessionId_status_idx" ON "RolloverRecord"("toSessionId", "status");
CREATE INDEX IF NOT EXISTS "RolloverRecord_fromStructureId_idx" ON "RolloverRecord"("fromStructureId");
CREATE INDEX IF NOT EXISTS "RolloverRecord_toStructureId_idx" ON "RolloverRecord"("toStructureId");
CREATE INDEX IF NOT EXISTS "RolloverRecord_approvedById_idx" ON "RolloverRecord"("approvedById");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AcademicSession_institutionId_fkey') THEN
    ALTER TABLE "AcademicSession"
      ADD CONSTRAINT "AcademicSession_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AcademicSession_createdById_fkey') THEN
    ALTER TABLE "AcademicSession"
      ADD CONSTRAINT "AcademicSession_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AcademicStructure_institutionId_fkey') THEN
    ALTER TABLE "AcademicStructure"
      ADD CONSTRAINT "AcademicStructure_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AcademicStructure_parentId_fkey') THEN
    ALTER TABLE "AcademicStructure"
      ADD CONSTRAINT "AcademicStructure_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "AcademicStructure"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AcademicStructure_createdById_fkey') THEN
    ALTER TABLE "AcademicStructure"
      ADD CONSTRAINT "AcademicStructure_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Enrolment_academicSessionId_fkey') THEN
    ALTER TABLE "Enrolment"
      ADD CONSTRAINT "Enrolment_academicSessionId_fkey"
      FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Enrolment_structureScopeId_fkey') THEN
    ALTER TABLE "Enrolment"
      ADD CONSTRAINT "Enrolment_structureScopeId_fkey"
      FOREIGN KEY ("structureScopeId") REFERENCES "AcademicStructure"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResultBatch_academicSessionId_fkey') THEN
    ALTER TABLE "ResultBatch"
      ADD CONSTRAINT "ResultBatch_academicSessionId_fkey"
      FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResultBatch_structureScopeId_fkey') THEN
    ALTER TABLE "ResultBatch"
      ADD CONSTRAINT "ResultBatch_structureScopeId_fkey"
      FOREIGN KEY ("structureScopeId") REFERENCES "AcademicStructure"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResultBatch_createdByInstitutionUserId_fkey') THEN
    ALTER TABLE "ResultBatch"
      ADD CONSTRAINT "ResultBatch_createdByInstitutionUserId_fkey"
      FOREIGN KEY ("createdByInstitutionUserId") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResultBatch_reviewedByInstitutionUserId_fkey') THEN
    ALTER TABLE "ResultBatch"
      ADD CONSTRAINT "ResultBatch_reviewedByInstitutionUserId_fkey"
      FOREIGN KEY ("reviewedByInstitutionUserId") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResultBatch_approvedByInstitutionUserId_fkey') THEN
    ALTER TABLE "ResultBatch"
      ADD CONSTRAINT "ResultBatch_approvedByInstitutionUserId_fkey"
      FOREIGN KEY ("approvedByInstitutionUserId") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AcademicRecord_academicSessionId_fkey') THEN
    ALTER TABLE "AcademicRecord"
      ADD CONSTRAINT "AcademicRecord_academicSessionId_fkey"
      FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AcademicRecord_structureScopeId_fkey') THEN
    ALTER TABLE "AcademicRecord"
      ADD CONSTRAINT "AcademicRecord_structureScopeId_fkey"
      FOREIGN KEY ("structureScopeId") REFERENCES "AcademicStructure"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolloverRecord_institutionId_fkey') THEN
    ALTER TABLE "RolloverRecord"
      ADD CONSTRAINT "RolloverRecord_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolloverRecord_learnerId_fkey') THEN
    ALTER TABLE "RolloverRecord"
      ADD CONSTRAINT "RolloverRecord_learnerId_fkey"
      FOREIGN KEY ("learnerId") REFERENCES "Learner"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolloverRecord_enrolmentId_fkey') THEN
    ALTER TABLE "RolloverRecord"
      ADD CONSTRAINT "RolloverRecord_enrolmentId_fkey"
      FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolloverRecord_fromSessionId_fkey') THEN
    ALTER TABLE "RolloverRecord"
      ADD CONSTRAINT "RolloverRecord_fromSessionId_fkey"
      FOREIGN KEY ("fromSessionId") REFERENCES "AcademicSession"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolloverRecord_toSessionId_fkey') THEN
    ALTER TABLE "RolloverRecord"
      ADD CONSTRAINT "RolloverRecord_toSessionId_fkey"
      FOREIGN KEY ("toSessionId") REFERENCES "AcademicSession"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolloverRecord_fromStructureId_fkey') THEN
    ALTER TABLE "RolloverRecord"
      ADD CONSTRAINT "RolloverRecord_fromStructureId_fkey"
      FOREIGN KEY ("fromStructureId") REFERENCES "AcademicStructure"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolloverRecord_toStructureId_fkey') THEN
    ALTER TABLE "RolloverRecord"
      ADD CONSTRAINT "RolloverRecord_toStructureId_fkey"
      FOREIGN KEY ("toStructureId") REFERENCES "AcademicStructure"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolloverRecord_createdById_fkey') THEN
    ALTER TABLE "RolloverRecord"
      ADD CONSTRAINT "RolloverRecord_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolloverRecord_approvedById_fkey') THEN
    ALTER TABLE "RolloverRecord"
      ADD CONSTRAINT "RolloverRecord_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
