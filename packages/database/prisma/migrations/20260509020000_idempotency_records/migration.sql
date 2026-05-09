DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IdempotencyRecordStatus') THEN
    CREATE TYPE "IdempotencyRecordStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "status" "IdempotencyRecordStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "actorType" TEXT,
  "actorUserId" UUID,
  "clientId" TEXT,
  "institutionId" UUID,
  "jobId" UUID,
  "response" JSONB,
  "error" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("uuid")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_scope_keyHash_key" ON "IdempotencyRecord"("scope", "keyHash");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_status_expiresAt_idx" ON "IdempotencyRecord"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_institutionId_createdAt_idx" ON "IdempotencyRecord"("institutionId", "createdAt");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_clientId_createdAt_idx" ON "IdempotencyRecord"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_jobId_idx" ON "IdempotencyRecord"("jobId");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_operation_createdAt_idx" ON "IdempotencyRecord"("operation", "createdAt");
