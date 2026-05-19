-- Production-scale read and operations indexes for AcadID gateway traffic.
-- These are intentionally additive and safe to apply to Supabase PostgreSQL.

CREATE INDEX IF NOT EXISTS "Learner_identityStatus_createdAt_idx"
  ON "Learner"("identityStatus", "createdAt");

CREATE INDEX IF NOT EXISTS "ApiKey_status_expiresAt_idx"
  ON "ApiKey"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "ApiKey_lastUsedAt_idx"
  ON "ApiKey"("lastUsedAt");

CREATE INDEX IF NOT EXISTS "Credential_status_issuedAt_idx"
  ON "Credential"("status", "issuedAt");
CREATE INDEX IF NOT EXISTS "Credential_type_status_issuedAt_idx"
  ON "Credential"("type", "status", "issuedAt");
CREATE INDEX IF NOT EXISTS "Credential_institutionId_issuedAt_idx"
  ON "Credential"("institutionId", "issuedAt");
CREATE INDEX IF NOT EXISTS "Credential_learnerId_issuedAt_idx"
  ON "Credential"("learnerId", "issuedAt");

CREATE INDEX IF NOT EXISTS "VerificationEvent_verifiedAt_idx"
  ON "VerificationEvent"("verifiedAt");
CREATE INDEX IF NOT EXISTS "VerificationEvent_outcome_verifiedAt_idx"
  ON "VerificationEvent"("outcome", "verifiedAt");
CREATE INDEX IF NOT EXISTS "VerificationEvent_verifierType_verifiedAt_idx"
  ON "VerificationEvent"("verifierType", "verifiedAt");
CREATE INDEX IF NOT EXISTS "VerificationEvent_accessGrantId_verifiedAt_idx"
  ON "VerificationEvent"("accessGrantId", "verifiedAt");
CREATE INDEX IF NOT EXISTS "VerificationEvent_ipAddressHash_verifiedAt_idx"
  ON "VerificationEvent"("ipAddressHash", "verifiedAt");

CREATE INDEX IF NOT EXISTS "VerificationEvent_accessGrant_recent_idx"
  ON "VerificationEvent"("accessGrantId", "verifiedAt" DESC)
  WHERE "accessGrantId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "VerificationEvent_suspicious_ip_recent_idx"
  ON "VerificationEvent"("ipAddressHash", "verifiedAt" DESC)
  WHERE "ipAddressHash" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "AuditEvent_action_createdAt_idx"
  ON "AuditEvent"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_outcome_createdAt_idx"
  ON "AuditEvent"("outcome", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_actorRole_createdAt_idx"
  ON "AuditEvent"("actorRole", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_ipAddressHash_createdAt_idx"
  ON "AuditEvent"("ipAddressHash", "createdAt");

CREATE INDEX IF NOT EXISTS "BackgroundJob_completedAt_idx"
  ON "BackgroundJob"("completedAt");
CREATE INDEX IF NOT EXISTS "BackgroundJob_failedAt_idx"
  ON "BackgroundJob"("failedAt");
CREATE INDEX IF NOT EXISTS "BackgroundJob_lockedAt_idx"
  ON "BackgroundJob"("lockedAt");
CREATE INDEX IF NOT EXISTS "BackgroundJob_ready_queue_idx"
  ON "BackgroundJob"("queue", "runAfter", "priority" DESC, "createdAt")
  WHERE "status" IN ('QUEUED', 'RETRYING');
CREATE INDEX IF NOT EXISTS "BackgroundJob_stale_running_idx"
  ON "BackgroundJob"("lockedAt", "queue")
  WHERE "status" = 'RUNNING';

CREATE INDEX IF NOT EXISTS "DomainEvent_publishedAt_idx"
  ON "DomainEvent"("publishedAt");
CREATE INDEX IF NOT EXISTS "DomainEvent_pending_type_idx"
  ON "DomainEvent"("type", "createdAt")
  WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "RecordRequest_paymentStatus_escrowStatus_updatedAt_idx"
  ON "RecordRequest"("paymentStatus", "escrowStatus", "updatedAt");
CREATE INDEX IF NOT EXISTS "RecordRequest_deadlineAt_status_idx"
  ON "RecordRequest"("deadlineAt", "status");

CREATE INDEX IF NOT EXISTS "RevenueLedgerEntry_source_lookup_idx"
  ON "RevenueLedgerEntry"("sourceType", "sourceId", "occurredAt");
