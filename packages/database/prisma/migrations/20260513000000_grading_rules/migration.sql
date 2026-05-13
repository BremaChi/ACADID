-- v5 modular grading rules and computed tertiary result metrics.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GradingRuleEngine') THEN
    CREATE TYPE "GradingRuleEngine" AS ENUM ('PRIMARY_SECONDARY', 'TERTIARY_GPA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GradingRuleStatus') THEN
    CREATE TYPE "GradingRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "GradingRuleSet" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institutionId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "engine" "GradingRuleEngine" NOT NULL,
  "status" "GradingRuleStatus" NOT NULL DEFAULT 'ACTIVE',
  "scale" JSONB NOT NULL,
  "passMark" DECIMAL(65,30),
  "maxScore" DECIMAL(65,30) NOT NULL DEFAULT 100,
  "gradePointMax" DECIMAL(65,30),
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GradingRuleSet_pkey" PRIMARY KEY ("uuid")
);

CREATE INDEX IF NOT EXISTS "GradingRuleSet_institutionId_status_engine_idx"
  ON "GradingRuleSet"("institutionId", "status", "engine");
CREATE INDEX IF NOT EXISTS "GradingRuleSet_institutionId_effectiveFrom_idx"
  ON "GradingRuleSet"("institutionId", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "GradingRuleSet_createdById_idx" ON "GradingRuleSet"("createdById");

ALTER TABLE "ResultBatch"
  ADD COLUMN IF NOT EXISTS "gradingRuleSetId" UUID;

ALTER TABLE "AcademicRecord"
  ADD COLUMN IF NOT EXISTS "gradingRuleSetId" UUID,
  ADD COLUMN IF NOT EXISTS "gradePoint" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "creditUnits" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "qualityPoints" DECIMAL(65,30);

CREATE INDEX IF NOT EXISTS "ResultBatch_gradingRuleSetId_idx" ON "ResultBatch"("gradingRuleSetId");
CREATE INDEX IF NOT EXISTS "AcademicRecord_gradingRuleSetId_idx" ON "AcademicRecord"("gradingRuleSetId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GradingRuleSet_institutionId_fkey'
  ) THEN
    ALTER TABLE "GradingRuleSet"
      ADD CONSTRAINT "GradingRuleSet_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GradingRuleSet_createdById_fkey'
  ) THEN
    ALTER TABLE "GradingRuleSet"
      ADD CONSTRAINT "GradingRuleSet_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "InstitutionUser"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ResultBatch_gradingRuleSetId_fkey'
  ) THEN
    ALTER TABLE "ResultBatch"
      ADD CONSTRAINT "ResultBatch_gradingRuleSetId_fkey"
      FOREIGN KEY ("gradingRuleSetId") REFERENCES "GradingRuleSet"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AcademicRecord_gradingRuleSetId_fkey'
  ) THEN
    ALTER TABLE "AcademicRecord"
      ADD CONSTRAINT "AcademicRecord_gradingRuleSetId_fkey"
      FOREIGN KEY ("gradingRuleSetId") REFERENCES "GradingRuleSet"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
