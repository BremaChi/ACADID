import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuthTokenPayload } from "../../auth/types.js";
import { PrismaService } from "../../platform/services/prisma.service.js";
import { AuditService } from "../../platform/services/audit.service.js";
import { AuthorityService } from "../../platform/services/authority.service.js";
import { CredentialSigningService } from "../../platform/services/credential-signing.service.js";

type BatchTransition = "SUBMITTED" | "REVIEWED" | "APPROVED";

@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authority: AuthorityService,
    private readonly signer: CredentialSigningService
  ) {}

  async transitionBatch(auth: AuthTokenPayload, batchId: string, status: BatchTransition) {
    const existingBatch = await this.prisma.resultBatch.findUnique({
      where: { uuid: batchId },
      select: { institutionId: true }
    });

    if (!existingBatch) {
      throw new BadRequestException("Result batch not found.");
    }

    await this.authority.assertActorCanOperateInstitution(auth, existingBatch.institutionId);

    const batch = await this.prisma.resultBatch.update({
      where: { uuid: batchId },
      data: this.transitionData(status)
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: `result_batch.${status.toLowerCase()}`,
      targetType: "ResultBatch",
      targetId: batchId,
      institutionId: batch.institutionId,
      outcome: "SUCCESS"
    });

    return batch;
  }

  async publishBatch(auth: AuthTokenPayload, batchId: string) {
    const batch = await this.prisma.resultBatch.findUnique({
      where: { uuid: batchId },
      include: {
        institution: { include: { authorityGrants: true } },
        academicRecords: { include: { enrolment: true } }
      }
    });

    if (!batch) {
      throw new BadRequestException("Result batch not found.");
    }

    await this.authority.assertInstitutionCan(batch.institutionId, "publish_credentials", auth);

    if (batch.status !== "APPROVED") {
      throw new BadRequestException("Only approved batches can be published.");
    }

    const issuedAt = new Date();
    const signedCredentials = await Promise.all(
      batch.academicRecords.map(async (record) => {
        const credentialRef = randomUUID();
        const vcPayload = {
          "@context": ["https://www.w3.org/ns/credentials/v2"],
          id: `urn:uuid:${credentialRef}`,
          type: ["VerifiableCredential", "AcadIDAcademicRecordCredential"],
          issuer: batch.institution.institutionId,
          validFrom: issuedAt.toISOString(),
          credentialSubject: {
            learnerId: record.enrolment.learnerId,
            academicRecordId: record.uuid,
            periodLabel: record.periodLabel,
            subjectCode: record.subjectCode,
            subjectName: record.subjectName,
            totalScore: Number(record.totalScore),
            grade: record.grade
          }
        };
        const signed = await this.signer.sign(vcPayload);

        return {
          credentialRef,
          record,
          vcPayload: {
            ...(signed.payload as Record<string, unknown>),
            proof: signed.proof
          },
          signature: signed.signature
        };
      })
    );

    const published = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedBatch = await tx.resultBatch.update({
        where: { uuid: batchId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date()
        }
      });

      await tx.academicRecord.updateMany({
        where: { resultBatchId: batchId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date()
        }
      });

      for (const signedCredential of signedCredentials) {
        await tx.credential.create({
          data: {
            credentialRef: signedCredential.credentialRef,
            learnerId: signedCredential.record.enrolment.learnerId,
            institutionId: batch.institutionId,
            academicRecordId: signedCredential.record.uuid,
            type: "RESULT_SLIP",
            scope: { academicRecordId: signedCredential.record.uuid } as Prisma.InputJsonValue,
            vcPayload: signedCredential.vcPayload as unknown as Prisma.InputJsonValue,
            signature: signedCredential.signature
          }
        });
      }

      return updatedBatch;
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "result_batch.publish",
      targetType: "ResultBatch",
      targetId: batchId,
      institutionId: batch.institutionId,
      outcome: "SUCCESS"
    });

    return published;
  }

  async rejectBatch(auth: AuthTokenPayload, batchId: string, reason: string) {
    const existingBatch = await this.prisma.resultBatch.findUnique({
      where: { uuid: batchId },
      select: { institutionId: true }
    });

    if (!existingBatch) {
      throw new BadRequestException("Result batch not found.");
    }

    await this.authority.assertActorCanOperateInstitution(auth, existingBatch.institutionId);

    const batch = await this.prisma.resultBatch.update({
      where: { uuid: batchId },
      data: {
        status: "DRAFT",
        rejectionCount: { increment: 1 }
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "result_batch.reject",
      targetType: "ResultBatch",
      targetId: batchId,
      institutionId: batch.institutionId,
      outcome: "SUCCESS",
      reason
    });

    return batch;
  }

  amend(body: unknown) {
    return {
      accepted: true,
      operation: "amend",
      next: "Registrar-only amendment will create signed new version without overwriting original",
      received: body
    };
  }

  revoke(body: unknown) {
    return {
      accepted: true,
      operation: "revoke",
      next: "Registrar-only revocation will update credential status and reason",
      received: body
    };
  }

  private transitionData(status: BatchTransition) {
    const timestamp = new Date();
    if (status === "SUBMITTED") {
      return { status, submittedAt: timestamp };
    }
    if (status === "REVIEWED") {
      return { status, reviewedAt: timestamp };
    }
    return { status, approvedAt: timestamp };
  }
}
