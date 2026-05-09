-- Institution-scoped webhook endpoints, secrets, and delivery replay linkage.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WebhookEndpointStatus') THEN
    CREATE TYPE "WebhookEndpointStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "WebhookEndpoint" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institutionId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "eventTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "secretEncrypted" TEXT NOT NULL,
  "secretPreview" TEXT,
  "status" "WebhookEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" UUID,
  "rotatedAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("uuid")
);

ALTER TABLE "WebhookDelivery"
  ADD COLUMN IF NOT EXISTS "webhookEndpointId" UUID;

CREATE INDEX IF NOT EXISTS "WebhookEndpoint_institutionId_status_idx" ON "WebhookEndpoint"("institutionId", "status");
CREATE INDEX IF NOT EXISTS "WebhookEndpoint_targetUrl_idx" ON "WebhookEndpoint"("targetUrl");
CREATE INDEX IF NOT EXISTS "WebhookEndpoint_createdById_idx" ON "WebhookEndpoint"("createdById");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_webhookEndpointId_status_idx" ON "WebhookDelivery"("webhookEndpointId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookEndpoint_institutionId_fkey') THEN
    ALTER TABLE "WebhookEndpoint"
      ADD CONSTRAINT "WebhookEndpoint_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookEndpoint_createdById_fkey') THEN
    ALTER TABLE "WebhookEndpoint"
      ADD CONSTRAINT "WebhookEndpoint_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookDelivery_webhookEndpointId_fkey') THEN
    ALTER TABLE "WebhookDelivery"
      ADD CONSTRAINT "WebhookDelivery_webhookEndpointId_fkey"
      FOREIGN KEY ("webhookEndpointId") REFERENCES "WebhookEndpoint"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
