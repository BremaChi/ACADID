-- CreateEnum
CREATE TYPE "InstitutionApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApiKeyOwnerType" AS ENUM ('PRODUCT', 'INSTITUTION');

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "ownerType" "ApiKeyOwnerType" NOT NULL DEFAULT 'INSTITUTION';
ALTER TABLE "ApiKey" ADD COLUMN "productCode" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "productName" TEXT;
ALTER TABLE "ApiKey" ALTER COLUMN "institutionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "InstitutionApplication" (
    "uuid" UUID NOT NULL,
    "officialName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactPersonName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "studentVolume" INTEGER NOT NULL,
    "documentUploads" JSONB NOT NULL,
    "mouAcceptedAt" TIMESTAMP(3),
    "status" "InstitutionApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewFeedback" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "approvedInstitutionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionApplication_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "ApiKey_ownerType_status_idx" ON "ApiKey"("ownerType", "status");

-- CreateIndex
CREATE INDEX "ApiKey_productCode_status_idx" ON "ApiKey"("productCode", "status");

-- CreateIndex
CREATE INDEX "InstitutionApplication_status_createdAt_idx" ON "InstitutionApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InstitutionApplication_contactEmail_idx" ON "InstitutionApplication"("contactEmail");

-- AddForeignKey
ALTER TABLE "InstitutionApplication" ADD CONSTRAINT "InstitutionApplication_approvedInstitutionId_fkey" FOREIGN KEY ("approvedInstitutionId") REFERENCES "Institution"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
