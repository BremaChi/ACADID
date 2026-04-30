-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "DisputePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "Dispute" (
    "uuid" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "priority" "DisputePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "institutionId" UUID,
    "learnerId" UUID,
    "credentialId" UUID,
    "reporterName" TEXT,
    "reporterEmail" TEXT,
    "assignedToId" UUID,
    "institutionNotice" TEXT,
    "noticeSentAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "Dispute_status_createdAt_idx" ON "Dispute"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Dispute_institutionId_status_idx" ON "Dispute"("institutionId", "status");

-- CreateIndex
CREATE INDEX "Dispute_learnerId_idx" ON "Dispute"("learnerId");

-- CreateIndex
CREATE INDEX "Dispute_credentialId_idx" ON "Dispute"("credentialId");

-- CreateIndex
CREATE INDEX "Dispute_assignedToId_idx" ON "Dispute"("assignedToId");

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
