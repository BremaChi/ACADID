import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../platform/services/prisma.service.js";
import { AuditService } from "../../platform/services/audit.service.js";
import { CredentialSigningService } from "../../platform/services/credential-signing.service.js";

type BatchTransition = "SUBMITTED" | "REVIEWED" | "APPROVED";

@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly signer: CredentialSigningService
  ) {}

  async transitionBatch(batchId: string, status: BatchTransition) {
    const batch = await this.prisma.resultBatch.update({
      where: { uuid: batchId },
      data: this.transitionData(status)
    });

    await this.audit.write({
      action: `result_batch.${status.toLowerCase()}`,
      targetType: "ResultBatch",
      targetId: batchId,
      institutionId: batch.institutionId,
      outcome: "SUCCESS"
    });

    return batch;
  }

  async publishBatch(batchId: string) {
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

    const activeAuthority = batch.institution.authorityGrants.some(
      (grant: { status: string }) => grant.status === "ACTIVE"
    );
    if (!activeAuthority) {
      throw new BadRequestException("Institution does not have an active Authority Grant.");
    }

    if (batch.status !== "APPROVED") {
      throw new BadRequestException("Only approved batches can be published.");
    }

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

      for (const record of batch.academicRecords) {
        const vcPayload = {
          "@context": ["https://www.w3.org/ns/credentials/v2"],
          type: ["VerifiableCredential", "AcadIDAcademicRecordCredential"],
          issuer: batch.institution.institutionId,
          validFrom: new Date().toISOString(),
          credentialSubject: {
            learnerId: record.enrolment.learnerId,
            academicRecordId: record.uuid,
            periodLabel: record.periodLabel,
            subjectCode: record.subjectCode,
            subjectName: record.subjectName,
            totalScore: record.totalScore,
            grade: record.grade
          }
        };
        const signed = await this.signer.sign(vcPayload);

        await tx.credential.create({
          data: {
            credentialRef: randomUUID(),
            learnerId: record.enrolment.learnerId,
            institutionId: batch.institutionId,
            academicRecordId: record.uuid,
            type: "RESULT_SLIP",
            scope: { academicRecordId: record.uuid } as Prisma.InputJsonValue,
            vcPayload: signed.payload as Prisma.InputJsonValue,
            signature: signed.signature
          }
        });
      }

      return updatedBatch;
    });

    await this.audit.write({
      action: "result_batch.publish",
      targetType: "ResultBatch",
      targetId: batchId,
      institutionId: batch.institutionId,
      outcome: "SUCCESS"
    });

    return published;
  }

  async rejectBatch(batchId: string, reason: string) {
    const batch = await this.prisma.resultBatch.update({
      where: { uuid: batchId },
      data: {
        status: "DRAFT",
        rejectionCount: { increment: 1 }
      }
    });

    await this.audit.write({
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
