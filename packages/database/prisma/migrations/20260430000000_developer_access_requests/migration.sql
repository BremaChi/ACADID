-- CreateEnum
CREATE TYPE "DeveloperAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "DeveloperAccessRequest" (
    "uuid" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "requestedById" UUID,
    "developerName" TEXT NOT NULL,
    "developerEmail" TEXT NOT NULL,
    "developerPhone" TEXT,
    "reason" TEXT NOT NULL,
    "requestedScopes" TEXT[],
    "status" "DeveloperAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewFeedback" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperAccessRequest_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "DeveloperAccessRequest_institutionId_status_idx" ON "DeveloperAccessRequest"("institutionId", "status");

-- CreateIndex
CREATE INDEX "DeveloperAccessRequest_status_createdAt_idx" ON "DeveloperAccessRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeveloperAccessRequest_developerEmail_idx" ON "DeveloperAccessRequest"("developerEmail");

-- AddForeignKey
ALTER TABLE "DeveloperAccessRequest" ADD CONSTRAINT "DeveloperAccessRequest_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
