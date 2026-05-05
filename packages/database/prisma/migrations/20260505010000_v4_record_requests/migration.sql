DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecordRequestStatus') THEN
    CREATE TYPE "RecordRequestStatus" AS ENUM (
      'SUBMITTED',
      'AWAITING_PAYMENT',
      'ASSIGNED',
      'INSTITUTION_REVIEW',
      'NEEDS_MORE_INFORMATION',
      'APPROVED',
      'REJECTED',
      'FULFILLED',
      'DISPUTED',
      'ESCALATED',
      'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecordRequestPaymentStatus') THEN
    CREATE TYPE "RecordRequestPaymentStatus" AS ENUM (
      'NOT_REQUIRED',
      'PENDING',
      'PAID',
      'WAIVED',
      'REFUNDED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RecordRequest" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" TEXT NOT NULL,
  "learnerId" UUID,
  "institutionId" UUID,
  "institutionNameSubmitted" TEXT NOT NULL,
  "educationLevel" TEXT NOT NULL,
  "yearsAttendedFrom" INTEGER,
  "yearsAttendedTo" INTEGER,
  "studentNumber" TEXT,
  "departmentOrClass" TEXT,
  "recordTypesRequested" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "proofDocumentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "RecordRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "paymentStatus" "RecordRequestPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paymentReference" TEXT,
  "amountMinor" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "deadlineAt" TIMESTAMP(3),
  "assignedToId" UUID,
  "requesterName" TEXT,
  "requesterEmail" TEXT,
  "rejectionReason" TEXT,
  "escalationReason" TEXT,
  "resolutionNote" TEXT,
  "notes" JSONB,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "escalatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecordRequest_pkey" PRIMARY KEY ("uuid")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecordRequest_requestId_key" ON "RecordRequest"("requestId");
CREATE INDEX IF NOT EXISTS "RecordRequest_status_createdAt_idx" ON "RecordRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "RecordRequest_institutionId_status_idx" ON "RecordRequest"("institutionId", "status");
CREATE INDEX IF NOT EXISTS "RecordRequest_learnerId_createdAt_idx" ON "RecordRequest"("learnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "RecordRequest_requestId_idx" ON "RecordRequest"("requestId");
CREATE INDEX IF NOT EXISTS "RecordRequest_assignedToId_status_idx" ON "RecordRequest"("assignedToId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordRequest_learnerId_fkey') THEN
    ALTER TABLE "RecordRequest"
      ADD CONSTRAINT "RecordRequest_learnerId_fkey"
      FOREIGN KEY ("learnerId") REFERENCES "Learner"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordRequest_institutionId_fkey') THEN
    ALTER TABLE "RecordRequest"
      ADD CONSTRAINT "RecordRequest_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordRequest_assignedToId_fkey') THEN
    ALTER TABLE "RecordRequest"
      ADD CONSTRAINT "RecordRequest_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
