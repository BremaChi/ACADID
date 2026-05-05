import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { RecordRequestStatus, UserRole, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { reviewRecordRequestSchema } from "@acadid/shared";
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
      actorId: auth.kind === "API_KEY" ? undefined : auth.sub,
      actorRole: auth.kind === "API_KEY" ? undefined : auth.role,
      action: `result_batch.${status.toLowerCase()}`,
      targetType: "ResultBatch",
      targetId: batchId,
      institutionId: batch.institutionId,
      outcome: "SUCCESS",
      metadata: { apiKeyId: auth.apiKeyId }
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

    const published = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
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
      },
      { maxWait: 20000, timeout: 60000 }
    );

    await this.audit.write({
      actorId: auth.kind === "API_KEY" ? undefined : auth.sub,
      actorRole: auth.kind === "API_KEY" ? undefined : auth.role,
      action: "result_batch.publish",
      targetType: "ResultBatch",
      targetId: batchId,
      institutionId: batch.institutionId,
      outcome: "SUCCESS",
      metadata: { apiKeyId: auth.apiKeyId }
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
      actorId: auth.kind === "API_KEY" ? undefined : auth.sub,
      actorRole: auth.kind === "API_KEY" ? undefined : auth.role,
      action: "result_batch.reject",
      targetType: "ResultBatch",
      targetId: batchId,
      institutionId: batch.institutionId,
      outcome: "SUCCESS",
      reason,
      metadata: { apiKeyId: auth.apiKeyId }
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

  async listRecordRequests(auth: AuthTokenPayload, status?: RecordRequestStatus) {
    const institutionWhere = await this.authority.institutionWhereForActor(auth);
    return this.prisma.recordRequest.findMany({
      where: {
        ...(institutionWhere ?? {}),
        ...(status ? { status } : {})
      },
      include: this.recordRequestInclude(),
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async reviewRecordRequest(auth: AuthTokenPayload, id: string, body: unknown) {
    const parsed = reviewRecordRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existing = await this.prisma.recordRequest.findUnique({
      where: { uuid: id },
      include: this.recordRequestInclude()
    });
    if (!existing) {
      throw new BadRequestException("Record request not found.");
    }

    if (existing.institutionId) {
      await this.authority.assertActorCanOperateInstitution(auth, existing.institutionId);
    } else if (auth.role !== UserRole.ACADID_SUPER_ADMIN) {
      throw new ForbiddenException("Only founder operations can review unassigned record requests.");
    }

    const status = parsed.data.status;
    const now = new Date();
    const notes = this.appendRecordRequestNote(existing.notes, {
      at: now.toISOString(),
      by: auth.sub,
      role: auth.role,
      status,
      note: parsed.data.note
    });
    const request = await this.prisma.recordRequest.update({
      where: { uuid: id },
      data: {
        status,
        notes,
        assignedToId: parsed.data.assignedToId,
        assignedAt: parsed.data.assignedToId ? now : undefined,
        rejectionReason: status === "REJECTED" ? parsed.data.rejectionReason ?? parsed.data.note : existing.rejectionReason,
        rejectedAt: status === "REJECTED" ? now : undefined,
        escalationReason: status === "ESCALATED" ? parsed.data.escalationReason ?? parsed.data.note : existing.escalationReason,
        escalatedAt: status === "ESCALATED" ? now : undefined,
        resolutionNote: status === "FULFILLED" ? parsed.data.resolutionNote ?? parsed.data.note : existing.resolutionNote,
        fulfilledAt: status === "FULFILLED" ? now : undefined
      },
      include: this.recordRequestInclude()
    });

    await this.audit.write({
      actorId: auth.kind === "API_KEY" ? undefined : auth.sub,
      actorRole: auth.kind === "API_KEY" ? undefined : auth.role,
      action: "record_request.review",
      targetType: "RecordRequest",
      targetId: request.uuid,
      institutionId: request.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        requestId: request.requestId,
        status,
        apiKeyId: auth.apiKeyId
      }
    });

    return { accepted: true, request };
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

  private recordRequestInclude() {
    return {
      learner: {
        select: {
          uuid: true,
          ain: true,
          fullName: true,
          identityStatus: true
        }
      },
      institution: {
        select: {
          uuid: true,
          institutionId: true,
          officialName: true,
          state: true,
          status: true
        }
      },
      assignedTo: {
        select: {
          uuid: true,
          fullName: true,
          email: true,
          role: true
        }
      }
    };
  }

  private appendRecordRequestNote(existing: Prisma.JsonValue, note: Record<string, unknown>) {
    const notes = Array.isArray(existing) ? existing : [];
    return [...notes, note] as Prisma.InputJsonValue;
  }
}
