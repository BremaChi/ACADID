-- Event-driven job foundation: background jobs, domain events, webhook deliveries, and notifications.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BackgroundJobType') THEN
    CREATE TYPE "BackgroundJobType" AS ENUM (
      'BULK_STUDENT_UPLOAD',
      'RESULT_BATCH_VALIDATION',
      'CREDENTIAL_GENERATION',
      'PDF_GENERATION',
      'SMS_EMAIL_DELIVERY',
      'PAYSTACK_PAYMENT_CONFIRMATION',
      'RECORD_REQUEST_DEADLINE',
      'WEBHOOK_DELIVERY',
      'PUSH_NOTIFICATION',
      'LIVE_RESULTS_CALLBACK',
      'EXAM_BODY_INGEST'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BackgroundJobStatus') THEN
    CREATE TYPE "BackgroundJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DomainEventStatus') THEN
    CREATE TYPE "DomainEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WebhookDeliveryStatus') THEN
    CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'RETRYING', 'FAILED', 'CANCELLED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationChannel') THEN
    CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'SMS', 'WEBHOOK');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationStatus') THEN
    CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BackgroundJob" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "BackgroundJobType" NOT NULL,
  "queue" TEXT NOT NULL,
  "status" "BackgroundJobStatus" NOT NULL DEFAULT 'QUEUED',
  "institutionId" UUID,
  "createdById" UUID,
  "relatedEntityType" TEXT,
  "relatedEntityId" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("uuid")
);

CREATE TABLE IF NOT EXISTS "DomainEvent" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "institutionId" UUID,
  "jobId" UUID,
  "payload" JSONB NOT NULL,
  "status" "DomainEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("uuid")
);

CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "jobId" UUID,
  "eventId" UUID,
  "institutionId" UUID,
  "targetUrl" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastStatusCode" INTEGER,
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("uuid")
);

CREATE TABLE IF NOT EXISTS "Notification" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "jobId" UUID,
  "institutionId" UUID,
  "learnerId" UUID,
  "userId" UUID,
  "channel" "NotificationChannel" NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "payload" JSONB,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("uuid")
);

CREATE INDEX IF NOT EXISTS "BackgroundJob_queue_status_runAfter_priority_idx" ON "BackgroundJob"("queue", "status", "runAfter", "priority");
CREATE INDEX IF NOT EXISTS "BackgroundJob_institutionId_status_createdAt_idx" ON "BackgroundJob"("institutionId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "BackgroundJob_type_status_createdAt_idx" ON "BackgroundJob"("type", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "BackgroundJob_relatedEntityType_relatedEntityId_idx" ON "BackgroundJob"("relatedEntityType", "relatedEntityId");

CREATE INDEX IF NOT EXISTS "DomainEvent_status_createdAt_idx" ON "DomainEvent"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DomainEvent_type_createdAt_idx" ON "DomainEvent"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "DomainEvent_aggregateType_aggregateId_idx" ON "DomainEvent"("aggregateType", "aggregateId");
CREATE INDEX IF NOT EXISTS "DomainEvent_institutionId_createdAt_idx" ON "DomainEvent"("institutionId", "createdAt");
CREATE INDEX IF NOT EXISTS "DomainEvent_jobId_idx" ON "DomainEvent"("jobId");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_institutionId_status_idx" ON "WebhookDelivery"("institutionId", "status");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_eventType_createdAt_idx" ON "WebhookDelivery"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_jobId_idx" ON "WebhookDelivery"("jobId");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_eventId_idx" ON "WebhookDelivery"("eventId");

CREATE INDEX IF NOT EXISTS "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_channel_status_idx" ON "Notification"("channel", "status");
CREATE INDEX IF NOT EXISTS "Notification_institutionId_status_idx" ON "Notification"("institutionId", "status");
CREATE INDEX IF NOT EXISTS "Notification_learnerId_status_idx" ON "Notification"("learnerId", "status");
CREATE INDEX IF NOT EXISTS "Notification_userId_status_idx" ON "Notification"("userId", "status");
CREATE INDEX IF NOT EXISTS "Notification_jobId_idx" ON "Notification"("jobId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BackgroundJob_institutionId_fkey') THEN
    ALTER TABLE "BackgroundJob"
      ADD CONSTRAINT "BackgroundJob_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BackgroundJob_createdById_fkey') THEN
    ALTER TABLE "BackgroundJob"
      ADD CONSTRAINT "BackgroundJob_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DomainEvent_institutionId_fkey') THEN
    ALTER TABLE "DomainEvent"
      ADD CONSTRAINT "DomainEvent_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DomainEvent_jobId_fkey') THEN
    ALTER TABLE "DomainEvent"
      ADD CONSTRAINT "DomainEvent_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookDelivery_jobId_fkey') THEN
    ALTER TABLE "WebhookDelivery"
      ADD CONSTRAINT "WebhookDelivery_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookDelivery_eventId_fkey') THEN
    ALTER TABLE "WebhookDelivery"
      ADD CONSTRAINT "WebhookDelivery_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "DomainEvent"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookDelivery_institutionId_fkey') THEN
    ALTER TABLE "WebhookDelivery"
      ADD CONSTRAINT "WebhookDelivery_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_jobId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_institutionId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_learnerId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_learnerId_fkey"
      FOREIGN KEY ("learnerId") REFERENCES "Learner"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
