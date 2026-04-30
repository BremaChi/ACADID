-- CreateEnum
CREATE TYPE "RevenueCategory" AS ENUM ('VERIFICATION_FEE', 'CREDENTIAL_EXPORT_FEE', 'INSTITUTION_SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "RevenueEntryStatus" AS ENUM ('PENDING', 'BILLABLE', 'INVOICED', 'PAID', 'WAIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "RevenueLedgerEntry" (
    "uuid" UUID NOT NULL,
    "category" "RevenueCategory" NOT NULL,
    "status" "RevenueEntryStatus" NOT NULL DEFAULT 'BILLABLE',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "institutionId" UUID,
    "credentialId" UUID,
    "verificationEventId" UUID,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoicedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueLedgerEntry_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "InstitutionSubscription" (
    "uuid" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "planCode" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "billingInterval" TEXT NOT NULL DEFAULT 'MONTHLY',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "nextBillingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionSubscription_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "RevenueLedgerEntry_category_occurredAt_idx" ON "RevenueLedgerEntry"("category", "occurredAt");

-- CreateIndex
CREATE INDEX "RevenueLedgerEntry_status_occurredAt_idx" ON "RevenueLedgerEntry"("status", "occurredAt");

-- CreateIndex
CREATE INDEX "RevenueLedgerEntry_institutionId_occurredAt_idx" ON "RevenueLedgerEntry"("institutionId", "occurredAt");

-- CreateIndex
CREATE INDEX "RevenueLedgerEntry_sourceType_sourceId_idx" ON "RevenueLedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "InstitutionSubscription_institutionId_status_idx" ON "InstitutionSubscription"("institutionId", "status");

-- CreateIndex
CREATE INDEX "InstitutionSubscription_status_nextBillingAt_idx" ON "InstitutionSubscription"("status", "nextBillingAt");

-- AddForeignKey
ALTER TABLE "RevenueLedgerEntry" ADD CONSTRAINT "RevenueLedgerEntry_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueLedgerEntry" ADD CONSTRAINT "RevenueLedgerEntry_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueLedgerEntry" ADD CONSTRAINT "RevenueLedgerEntry_verificationEventId_fkey" FOREIGN KEY ("verificationEventId") REFERENCES "VerificationEvent"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionSubscription" ADD CONSTRAINT "InstitutionSubscription_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
