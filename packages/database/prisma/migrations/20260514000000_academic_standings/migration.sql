-- Durable CGPA/classification rollup per learner enrolment.

CREATE TABLE IF NOT EXISTS "AcademicStanding" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "learnerId" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "enrolmentId" UUID NOT NULL,
  "latestAcademicSessionId" UUID,
  "latestPeriodLabel" TEXT,
  "attemptedCreditUnits" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "earnedCreditUnits" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "qualityPoints" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "cgpa" DECIMAL(65,30),
  "gradePointMax" DECIMAL(65,30),
  "classification" TEXT,
  "classificationSystem" TEXT NOT NULL DEFAULT 'NIGERIAN_TERTIARY_5_POINT',
  "includedRecordCount" INTEGER NOT NULL DEFAULT 0,
  "periodCount" INTEGER NOT NULL DEFAULT 0,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AcademicStanding_pkey" PRIMARY KEY ("uuid")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AcademicStanding_enrolmentId_key" ON "AcademicStanding"("enrolmentId");
CREATE INDEX IF NOT EXISTS "AcademicStanding_learnerId_institutionId_idx" ON "AcademicStanding"("learnerId", "institutionId");
CREATE INDEX IF NOT EXISTS "AcademicStanding_institutionId_classification_idx" ON "AcademicStanding"("institutionId", "classification");
CREATE INDEX IF NOT EXISTS "AcademicStanding_cgpa_idx" ON "AcademicStanding"("cgpa");
CREATE INDEX IF NOT EXISTS "AcademicStanding_latestAcademicSessionId_idx" ON "AcademicStanding"("latestAcademicSessionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AcademicStanding_learnerId_fkey') THEN
    ALTER TABLE "AcademicStanding"
      ADD CONSTRAINT "AcademicStanding_learnerId_fkey"
      FOREIGN KEY ("learnerId") REFERENCES "Learner"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AcademicStanding_institutionId_fkey') THEN
    ALTER TABLE "AcademicStanding"
      ADD CONSTRAINT "AcademicStanding_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AcademicStanding_enrolmentId_fkey') THEN
    ALTER TABLE "AcademicStanding"
      ADD CONSTRAINT "AcademicStanding_enrolmentId_fkey"
      FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
