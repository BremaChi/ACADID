CREATE TYPE "WorkerHeartbeatStatus" AS ENUM ('ACTIVE', 'DRAINING', 'STOPPED');

CREATE TABLE "WorkerHeartbeat" (
  "workerId" TEXT NOT NULL,
  "hostname" TEXT,
  "processId" INTEGER,
  "queues" TEXT[] NOT NULL,
  "status" "WorkerHeartbeatStatus" NOT NULL DEFAULT 'ACTIVE',
  "concurrency" INTEGER NOT NULL DEFAULT 1,
  "currentJobId" UUID,
  "currentQueue" TEXT,
  "lastStartedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

CREATE INDEX "WorkerHeartbeat_status_lastSeenAt_idx" ON "WorkerHeartbeat"("status", "lastSeenAt");
CREATE INDEX "WorkerHeartbeat_currentQueue_idx" ON "WorkerHeartbeat"("currentQueue");
