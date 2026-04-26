-- CreateEnum
CREATE TYPE "LearnerIdentityStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('PRIMARY', 'SECONDARY', 'TERTIARY', 'EXAM_BODY');

-- CreateEnum
CREATE TYPE "InstitutionTier" AS ENUM ('FOUNDING', 'ACTIVE', 'VERIFIED');

-- CreateEnum
CREATE TYPE "InstitutionStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AuthorityGrantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EnrolmentStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ExitType" AS ENUM ('GRADUATE', 'TRANSFER', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('TERM', 'SEMESTER');

-- CreateEnum
CREATE TYPE "AcademicRecordStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'PUBLISHED', 'AMENDED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('TRANSCRIPT', 'RESULT_SLIP', 'CERTIFICATE');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'SUPERSEDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AccessGrantScope" AS ENUM ('FULL', 'GPA', 'SEMESTER', 'SUBJECT');

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('CONFIRMED', 'DENIED', 'DISCREPANCY', 'REVOKED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ACADID_SUPER_ADMIN', 'REGISTRAR', 'EXAM_OFFICER', 'DATA_ENTRY_OFFICER', 'STUDENT', 'GUARDIAN', 'VERIFIER');

-- CreateTable
CREATE TABLE "Learner" (
    "uuid" UUID NOT NULL,
    "ain" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "phone" TEXT,
    "ninEncrypted" TEXT,
    "jambId" TEXT,
    "identityStatus" "LearnerIdentityStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "guardianId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Learner_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Institution" (
    "uuid" UUID NOT NULL,
    "institutionId" TEXT NOT NULL,
    "officialName" TEXT NOT NULL,
    "type" "InstitutionType" NOT NULL,
    "state" TEXT NOT NULL,
    "tier" "InstitutionTier" NOT NULL DEFAULT 'FOUNDING',
    "signingKeyId" TEXT,
    "mouSignedAt" TIMESTAMP(3),
    "status" "InstitutionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "User" (
    "uuid" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "learnerId" UUID,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "InstitutionUser" (
    "uuid" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstitutionUser_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AuthorityGrant" (
    "uuid" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "mouDocumentUrl" TEXT NOT NULL,
    "signedByName" TEXT NOT NULL,
    "signedByTitle" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "permissions" JSONB NOT NULL,
    "status" "AuthorityGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorityGrant_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Enrolment" (
    "uuid" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "programme" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "exitDate" TIMESTAMP(3),
    "exitType" "ExitType",
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrolment_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ResultBatch" (
    "uuid" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultBatch_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AcademicRecord" (
    "uuid" UUID NOT NULL,
    "enrolmentId" UUID NOT NULL,
    "resultBatchId" UUID,
    "periodType" "PeriodType" NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "caScore" DECIMAL(65,30),
    "examScore" DECIMAL(65,30),
    "totalScore" DECIMAL(65,30) NOT NULL,
    "grade" TEXT NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicRecord_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Credential" (
    "uuid" UUID NOT NULL,
    "credentialRef" TEXT NOT NULL,
    "learnerId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicRecordId" UUID,
    "type" "CredentialType" NOT NULL,
    "scope" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "signature" TEXT,
    "vcPayload" JSONB NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "uuid" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "credentialId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" "AccessGrantScope" NOT NULL,
    "recipientLabel" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maxViews" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "VerificationEvent" (
    "uuid" UUID NOT NULL,
    "credentialId" UUID NOT NULL,
    "accessGrantId" UUID,
    "verifierType" TEXT NOT NULL,
    "verifierName" TEXT,
    "verifierEmailEncrypted" TEXT,
    "ipAddressHash" TEXT,
    "outcome" "VerificationOutcome" NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scopeViewed" JSONB NOT NULL,

    CONSTRAINT "VerificationEvent_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "uuid" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "checksum" TEXT,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "MouDocument" (
    "uuid" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "checksum" TEXT,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MouDocument_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "uuid" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" "UserRole",
    "institutionId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "ipAddressHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "Learner_ain_key" ON "Learner"("ain");

-- CreateIndex
CREATE INDEX "Learner_fullName_dateOfBirth_idx" ON "Learner"("fullName", "dateOfBirth");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_institutionId_key" ON "Institution"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_learnerId_key" ON "User"("learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionUser_userId_institutionId_role_key" ON "InstitutionUser"("userId", "institutionId", "role");

-- CreateIndex
CREATE INDEX "AuthorityGrant_institutionId_status_idx" ON "AuthorityGrant"("institutionId", "status");

-- CreateIndex
CREATE INDEX "Enrolment_learnerId_idx" ON "Enrolment"("learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrolment_institutionId_studentNumber_status_key" ON "Enrolment"("institutionId", "studentNumber", "status");

-- CreateIndex
CREATE INDEX "ResultBatch_institutionId_status_idx" ON "ResultBatch"("institutionId", "status");

-- CreateIndex
CREATE INDEX "AcademicRecord_enrolmentId_periodLabel_idx" ON "AcademicRecord"("enrolmentId", "periodLabel");

-- CreateIndex
CREATE INDEX "AcademicRecord_status_idx" ON "AcademicRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_credentialRef_key" ON "Credential"("credentialRef");

-- CreateIndex
CREATE INDEX "Credential_learnerId_status_idx" ON "Credential"("learnerId", "status");

-- CreateIndex
CREATE INDEX "Credential_institutionId_status_idx" ON "Credential"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_tokenHash_key" ON "AccessGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessGrant_learnerId_idx" ON "AccessGrant"("learnerId");

-- CreateIndex
CREATE INDEX "AccessGrant_credentialId_idx" ON "AccessGrant"("credentialId");

-- CreateIndex
CREATE INDEX "VerificationEvent_credentialId_verifiedAt_idx" ON "VerificationEvent"("credentialId", "verifiedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_institutionId_createdAt_idx" ON "AuditEvent"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Learner" ADD CONSTRAINT "Learner_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Learner"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionUser" ADD CONSTRAINT "InstitutionUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionUser" ADD CONSTRAINT "InstitutionUser_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityGrant" ADD CONSTRAINT "AuthorityGrant_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultBatch" ADD CONSTRAINT "ResultBatch_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicRecord" ADD CONSTRAINT "AcademicRecord_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicRecord" ADD CONSTRAINT "AcademicRecord_resultBatchId_fkey" FOREIGN KEY ("resultBatchId") REFERENCES "ResultBatch"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_academicRecordId_fkey" FOREIGN KEY ("academicRecordId") REFERENCES "AcademicRecord"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_accessGrantId_fkey" FOREIGN KEY ("accessGrantId") REFERENCES "AccessGrant"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

