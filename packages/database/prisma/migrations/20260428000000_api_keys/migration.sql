-- CreateEnum
CREATE TYPE "ApiKeyEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ApiKey" (
    "uuid" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "environment" "ApiKeyEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 100,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_clientId_key" ON "ApiKey"("clientId");

-- CreateIndex
CREATE INDEX "ApiKey_institutionId_status_idx" ON "ApiKey"("institutionId", "status");

-- CreateIndex
CREATE INDEX "ApiKey_clientId_status_idx" ON "ApiKey"("clientId", "status");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
