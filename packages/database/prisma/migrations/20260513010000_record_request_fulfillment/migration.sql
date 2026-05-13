-- v5 RecordRequest payment escrow and passport credential publication.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecordRequestEscrowStatus') THEN
    CREATE TYPE "RecordRequestEscrowStatus" AS ENUM ('NONE', 'HELD', 'RELEASED', 'REFUND_PENDING', 'REFUNDED');
  END IF;
END $$;

ALTER TABLE "RecordRequest"
  ADD COLUMN IF NOT EXISTS "escrowStatus" "RecordRequestEscrowStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentHeldAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentReleasedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fulfilledCredentialId" UUID;

ALTER TABLE "Credential"
  ADD COLUMN IF NOT EXISTS "recordRequestId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "RecordRequest_fulfilledCredentialId_key" ON "RecordRequest"("fulfilledCredentialId");
CREATE INDEX IF NOT EXISTS "RecordRequest_paymentStatus_escrowStatus_idx" ON "RecordRequest"("paymentStatus", "escrowStatus");
CREATE INDEX IF NOT EXISTS "Credential_recordRequestId_idx" ON "Credential"("recordRequestId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RecordRequest_fulfilledCredentialId_fkey'
  ) THEN
    ALTER TABLE "RecordRequest"
      ADD CONSTRAINT "RecordRequest_fulfilledCredentialId_fkey"
      FOREIGN KEY ("fulfilledCredentialId") REFERENCES "Credential"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Credential_recordRequestId_fkey'
  ) THEN
    ALTER TABLE "Credential"
      ADD CONSTRAINT "Credential_recordRequestId_fkey"
      FOREIGN KEY ("recordRequestId") REFERENCES "RecordRequest"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
