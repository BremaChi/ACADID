ALTER TABLE "AuditEvent"
  ADD COLUMN IF NOT EXISTS "requestId" TEXT,
  ADD COLUMN IF NOT EXISTS "actorType" TEXT,
  ADD COLUMN IF NOT EXISTS "actorUserId" UUID,
  ADD COLUMN IF NOT EXISTS "clientId" TEXT,
  ADD COLUMN IF NOT EXISTS "role" TEXT,
  ADD COLUMN IF NOT EXISTS "endpoint" TEXT,
  ADD COLUMN IF NOT EXISTS "httpMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "entityType" TEXT,
  ADD COLUMN IF NOT EXISTS "entityId" TEXT,
  ADD COLUMN IF NOT EXISTS "userAgentHash" TEXT;

UPDATE "AuditEvent"
SET
  "actorType" = COALESCE("actorType", CASE WHEN "actorId" IS NOT NULL THEN 'USER' ELSE 'SYSTEM' END),
  "actorUserId" = COALESCE("actorUserId", "actorId"),
  "role" = COALESCE("role", "actorRole"::TEXT),
  "entityType" = COALESCE("entityType", "targetType"),
  "entityId" = COALESCE("entityId", "targetId")
WHERE
  "actorType" IS NULL
  OR "actorUserId" IS NULL
  OR "role" IS NULL
  OR "entityType" IS NULL
  OR "entityId" IS NULL;

CREATE INDEX IF NOT EXISTS "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");
CREATE INDEX IF NOT EXISTS "AuditEvent_actorType_createdAt_idx" ON "AuditEvent"("actorType", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_clientId_createdAt_idx" ON "AuditEvent"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_endpoint_createdAt_idx" ON "AuditEvent"("endpoint", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");
