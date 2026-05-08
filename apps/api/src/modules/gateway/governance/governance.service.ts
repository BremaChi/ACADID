import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { RecordRequestStatus, UserRole, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  confirmRolloverSchema,
  previewRolloverSchema,
  requestSealedSessionReopenSchema,
  reviewRecordRequestSchema,
  reviewSealedSessionReopenSchema
} from "@acadid/shared";
import type { AuthTokenPayload } from "../../auth/types.js";
import { PrismaService } from "../../platform/services/prisma.service.js";
import { AuditService } from "../../platform/services/audit.service.js";
import { AuthorityService } from "../../platform/services/authority.service.js";
import { CredentialSigningService } from "../../platform/services/credential-signing.service.js";
import { CacheService } from "../../platform/services/cache.service.js";

type BatchTransition = "SUBMITTED" | "REVIEWED" | "APPROVED";
type RolloverDecision = "PROMOTED" | "REPEATED" | "TRANSFERRED_OUT" | "WITHDRAWN" | "GRADUATED" | "SUSPENDED" | "SEALED";

@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authority: AuthorityService,
    private readonly signer: CredentialSigningService,
    private readonly cache?: CacheService
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

  async previewRollover(auth: AuthTokenPayload, body: unknown) {
    const parsed = previewRolloverSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const institution = await this.resolveHumanInstitution(auth, parsed.data.institutionId);
    await this.assertRolloverScope(institution.uuid, {
      fromSessionId: parsed.data.fromSessionId,
      toSessionId: parsed.data.toSessionId,
      fromStructureId: parsed.data.fromStructureId,
      toStructureId: parsed.data.toStructureId
    });

    const enrolments = await this.prisma.enrolment.findMany({
      where: {
        institutionId: institution.uuid,
        academicSessionId: parsed.data.fromSessionId,
        status: "ACTIVE",
        ...(parsed.data.fromStructureId ? { structureScopeId: parsed.data.fromStructureId } : {}),
        ...(parsed.data.enrolmentIds ? { uuid: { in: parsed.data.enrolmentIds } } : {})
      },
      include: {
        learner: { select: { uuid: true, ain: true, fullName: true, identityStatus: true } },
        structureScope: { select: { uuid: true, type: true, name: true, code: true } },
        rolloverRecords: {
          where: { fromSessionId: parsed.data.fromSessionId, status: { in: ["PENDING_ROLLOVER", "APPROVED"] } },
          select: { uuid: true, decision: true, status: true, createdAt: true }
        }
      },
      orderBy: [{ level: "asc" }, { studentNumber: "asc" }],
      take: parsed.data.limit
    });

    const candidates = enrolments.map((enrolment) => ({
      enrolmentId: enrolment.uuid,
      learnerId: enrolment.learnerId,
      ain: enrolment.learner.ain,
      learnerName: enrolment.learner.fullName,
      studentNumber: enrolment.studentNumber,
      currentLevel: enrolment.level,
      currentProgramme: enrolment.programme,
      fromSessionId: enrolment.academicSessionId,
      fromStructure: enrolment.structureScope
        ? {
            id: enrolment.structureScope.uuid,
            type: enrolment.structureScope.type,
            name: enrolment.structureScope.name,
            code: enrolment.structureScope.code
          }
        : null,
      recommendedDecision: parsed.data.decision,
      toSessionId: parsed.data.toSessionId ?? null,
      toStructureId: parsed.data.toStructureId ?? null,
      blockedByExistingRollover: enrolment.rolloverRecords[0] ?? null
    }));

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "rollover.preview",
      targetType: "AcademicSession",
      targetId: parsed.data.fromSessionId,
      institutionId: institution.uuid,
      outcome: "SUCCESS",
      metadata: {
        candidateCount: candidates.length,
        fromStructureId: parsed.data.fromStructureId,
        toSessionId: parsed.data.toSessionId,
        toStructureId: parsed.data.toStructureId
      }
    });

    return {
      accepted: true,
      institutionId: institution.institutionId,
      fromSessionId: parsed.data.fromSessionId,
      toSessionId: parsed.data.toSessionId ?? null,
      count: candidates.length,
      candidates
    };
  }

  async confirmRollover(auth: AuthTokenPayload, body: unknown) {
    const parsed = confirmRolloverSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const institution = await this.resolveHumanInstitution(auth, parsed.data.institutionId);
    await this.assertRolloverScope(institution.uuid, {
      fromSessionId: parsed.data.fromSessionId,
      toSessionId: parsed.data.toSessionId,
      fromStructureId: parsed.data.fromStructureId,
      toStructureId: parsed.data.toStructureId
    });

    const enrolmentIds = parsed.data.decisions.map((decision) => decision.enrolmentId);
    const enrolments = await this.prisma.enrolment.findMany({
      where: {
        uuid: { in: enrolmentIds },
        institutionId: institution.uuid,
        academicSessionId: parsed.data.fromSessionId,
        status: "ACTIVE",
        ...(parsed.data.fromStructureId ? { structureScopeId: parsed.data.fromStructureId } : {})
      }
    });
    const enrolmentById = new Map(enrolments.map((enrolment) => [enrolment.uuid, enrolment]));
    const missing = enrolmentIds.filter((id) => !enrolmentById.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({ message: "Some rollover decisions reference inactive or out-of-scope enrolments.", missing });
    }

    const existingRollovers = await this.prisma.rolloverRecord.findMany({
      where: {
        enrolmentId: { in: enrolmentIds },
        fromSessionId: parsed.data.fromSessionId,
        status: { in: ["PENDING_ROLLOVER", "APPROVED"] }
      },
      select: { enrolmentId: true }
    });
    const duplicateIds = existingRollovers.map((record) => record.enrolmentId).filter(Boolean);
    if (duplicateIds.length > 0) {
      throw new BadRequestException({ message: "Some enrolments already have pending or approved rollover records.", duplicateIds });
    }

    for (const decision of parsed.data.decisions) {
      await this.assertDecisionTarget(institution.uuid, decision.decision, {
        toSessionId: decision.toSessionId ?? parsed.data.toSessionId,
        toStructureId: decision.toStructureId ?? parsed.data.toStructureId
      });
    }

    const now = new Date();
    const confirmed = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const rows = [];

        for (const decision of parsed.data.decisions) {
          const enrolment = enrolmentById.get(decision.enrolmentId);
          if (!enrolment) {
            throw new BadRequestException("Rollover decision references an unknown enrolment.");
          }

          const toSessionId = decision.toSessionId ?? parsed.data.toSessionId;
          const toStructureId = decision.toStructureId ?? parsed.data.toStructureId ?? (decision.decision === "REPEATED" ? enrolment.structureScopeId : undefined);
          const nextStatus = enrolmentStatusForDecision(decision.decision);

          await tx.enrolment.update({
            where: { uuid: enrolment.uuid },
            data: {
              status: nextStatus,
              exitDate: terminalDecision(decision.decision) ? now : undefined,
              exitType: exitTypeForDecision(decision.decision)
            }
          });

          const rollover = await tx.rolloverRecord.create({
            data: {
              institutionId: institution.uuid,
              learnerId: enrolment.learnerId,
              enrolmentId: enrolment.uuid,
              fromSessionId: parsed.data.fromSessionId,
              toSessionId,
              fromStructureId: enrolment.structureScopeId,
              toStructureId,
              decision: decision.decision,
              status: "APPROVED",
              reason: decision.reason,
              createdById: auth.institutionUserId,
              approvedById: auth.institutionUserId,
              approvedAt: now
            }
          });

          const nextEnrolment =
            decision.decision === "PROMOTED" || decision.decision === "REPEATED"
              ? await tx.enrolment.create({
                  data: {
                    learnerId: enrolment.learnerId,
                    institutionId: institution.uuid,
                    academicSessionId: toSessionId,
                    structureScopeId: toStructureId,
                    studentNumber: enrolment.studentNumber,
                    level: await this.levelForTargetStructure(tx, toStructureId, enrolment.level),
                    programme: enrolment.programme,
                    entryDate: now,
                    status: "ACTIVE"
                  }
                })
              : null;

          rows.push({
            rolloverId: rollover.uuid,
            enrolmentId: enrolment.uuid,
            learnerId: enrolment.learnerId,
            decision: decision.decision,
            status: rollover.status,
            newEnrolmentId: nextEnrolment?.uuid ?? null
          });
        }

        return rows;
      },
      { maxWait: 20000, timeout: 60000 }
    );

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "rollover.confirm",
      targetType: "AcademicSession",
      targetId: parsed.data.fromSessionId,
      institutionId: institution.uuid,
      outcome: "SUCCESS",
      metadata: {
        confirmedCount: confirmed.length,
        decisions: confirmed.reduce<Record<string, number>>((counts, row) => {
          counts[row.decision] = (counts[row.decision] ?? 0) + 1;
          return counts;
        }, {})
      }
    });

    return {
      accepted: true,
      institutionId: institution.institutionId,
      confirmedCount: confirmed.length,
      rollovers: confirmed
    };
  }

  async requestSealedSessionReopen(auth: AuthTokenPayload, sessionId: string, body: unknown) {
    const parsed = requestSealedSessionReopenSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    if (auth.kind === "API_KEY") {
      throw new ForbiddenException("Human institution session is required for sealed-session escalation.");
    }

    const session = await this.prisma.academicSession.findUnique({
      where: { uuid: sessionId },
      include: { institution: { select: { uuid: true, institutionId: true, officialName: true, status: true } } }
    });
    if (!session || session.institution.status !== "ACTIVE") {
      throw new BadRequestException("Active institution academic session not found.");
    }
    await this.authority.assertActorCanOperateInstitution(auth, session.institutionId);
    if (session.status !== "SEALED") {
      throw new BadRequestException("Only sealed academic sessions require reopen escalation.");
    }

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "academic_session.reopen_requested",
      targetType: "AcademicSession",
      targetId: session.uuid,
      institutionId: session.institutionId,
      outcome: "SUCCESS",
      reason: parsed.data.reason,
      metadata: {
        requestedStatus: parsed.data.requestedStatus,
        sessionLabel: session.sessionLabel,
        periodType: session.periodType,
        periodLabel: session.periodLabel
      }
    });

    return {
      accepted: true,
      status: "ESCALATED",
      sessionId: session.uuid,
      institutionId: session.institution.institutionId,
      requestedStatus: parsed.data.requestedStatus
    };
  }

  async reviewSealedSessionReopen(auth: AuthTokenPayload, sessionId: string, body: unknown) {
    const parsed = reviewSealedSessionReopenSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    if (auth.role !== UserRole.ACADID_SUPER_ADMIN) {
      throw new ForbiddenException("Only Founder Admin can review sealed-session reopen requests.");
    }

    const session = await this.prisma.academicSession.findUnique({
      where: { uuid: sessionId },
      include: { institution: { select: { uuid: true, institutionId: true, officialName: true, status: true } } }
    });
    if (!session || session.institution.status !== "ACTIVE") {
      throw new BadRequestException("Active institution academic session not found.");
    }
    if (session.status !== "SEALED") {
      throw new BadRequestException("Only sealed academic sessions can be reviewed for reopen.");
    }

    const reviewed =
      parsed.data.decision === "APPROVE"
        ? await this.prisma.academicSession.update({
            where: { uuid: session.uuid },
            data: { status: parsed.data.newStatus }
          })
        : session;

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: parsed.data.decision === "APPROVE" ? "academic_session.reopen_approved" : "academic_session.reopen_rejected",
      targetType: "AcademicSession",
      targetId: session.uuid,
      institutionId: session.institutionId,
      outcome: "SUCCESS",
      reason: parsed.data.reason,
      metadata: {
        previousStatus: session.status,
        newStatus: reviewed.status,
        sessionLabel: session.sessionLabel,
        periodType: session.periodType,
        periodLabel: session.periodLabel
      }
    });

    return {
      accepted: true,
      decision: parsed.data.decision,
      sessionId: session.uuid,
      institutionId: session.institution.institutionId,
      status: reviewed.status
    };
  }

  amend(body: unknown) {
    this.invalidateCredentialStatusFromBody(body);
    return {
      accepted: true,
      operation: "amend",
      next: "Registrar-only amendment will create signed new version without overwriting original",
      received: body
    };
  }

  revoke(body: unknown) {
    this.invalidateCredentialStatusFromBody(body);
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

  private async resolveHumanInstitution(auth: AuthTokenPayload, institutionRef: string) {
    if (auth.kind === "API_KEY") {
      throw new ForbiddenException("Human institution session is required for governance actions.");
    }

    const institution = await this.prisma.institution.findFirst({
      where: this.institutionRefWhere(institutionRef),
      select: { uuid: true, institutionId: true, officialName: true, status: true }
    });
    if (!institution || institution.status !== "ACTIVE") {
      throw new BadRequestException("Active institution not found.");
    }

    await this.authority.assertActorCanOperateInstitution(auth, institution.uuid);
    return institution;
  }

  private async assertRolloverScope(
    institutionId: string,
    input: { fromSessionId: string; toSessionId?: string; fromStructureId?: string; toStructureId?: string }
  ) {
    const [fromSession, toSession, fromStructure, toStructure] = await Promise.all([
      this.prisma.academicSession.findUnique({ where: { uuid: input.fromSessionId }, select: { institutionId: true, status: true } }),
      input.toSessionId
        ? this.prisma.academicSession.findUnique({ where: { uuid: input.toSessionId }, select: { institutionId: true, status: true } })
        : Promise.resolve(null),
      input.fromStructureId
        ? this.prisma.academicStructure.findUnique({ where: { uuid: input.fromStructureId }, select: { institutionId: true, status: true } })
        : Promise.resolve(null),
      input.toStructureId
        ? this.prisma.academicStructure.findUnique({ where: { uuid: input.toStructureId }, select: { institutionId: true, status: true } })
        : Promise.resolve(null)
    ]);

    if (!fromSession || fromSession.institutionId !== institutionId || fromSession.status === "SEALED") {
      throw new BadRequestException("Source academic session must belong to the institution and must not be sealed.");
    }
    if (input.toSessionId && (!toSession || toSession.institutionId !== institutionId || toSession.status === "SEALED")) {
      throw new BadRequestException("Target academic session must belong to the institution and must not be sealed.");
    }
    if (input.fromStructureId && (!fromStructure || fromStructure.institutionId !== institutionId || fromStructure.status !== "ACTIVE")) {
      throw new BadRequestException("Source academic structure must be active and belong to the institution.");
    }
    if (input.toStructureId && (!toStructure || toStructure.institutionId !== institutionId || toStructure.status !== "ACTIVE")) {
      throw new BadRequestException("Target academic structure must be active and belong to the institution.");
    }
  }

  private async assertDecisionTarget(institutionId: string, decision: RolloverDecision, input: { toSessionId?: string; toStructureId?: string }) {
    if (decision !== "PROMOTED" && decision !== "REPEATED") {
      return;
    }
    if (!input.toSessionId) {
      throw new BadRequestException(`${decision} rollover decisions require a target academic session.`);
    }

    await this.assertRolloverScope(institutionId, {
      fromSessionId: input.toSessionId,
      toSessionId: input.toSessionId,
      toStructureId: input.toStructureId
    });
  }

  private async levelForTargetStructure(tx: Prisma.TransactionClient, structureId: string | null | undefined, fallbackLevel: string) {
    if (!structureId) {
      return fallbackLevel;
    }

    const structure = await tx.academicStructure.findUnique({
      where: { uuid: structureId },
      select: { name: true }
    });
    return structure?.name ?? fallbackLevel;
  }

  private institutionRefWhere(institutionRef: string): Prisma.InstitutionWhereInput {
    return this.isUuid(institutionRef) ? { uuid: institutionRef } : { institutionId: institutionRef };
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
  }

  private invalidateCredentialStatusFromBody(body: unknown) {
    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const credentialRef = typeof input.credentialRef === "string" ? input.credentialRef : undefined;
    if (credentialRef) {
      this.cache?.invalidateTag(`credential:${credentialRef}`);
    }
  }
}

function enrolmentStatusForDecision(decision: RolloverDecision) {
  if (decision === "TRANSFERRED_OUT") return "TRANSFERRED_OUT";
  return decision;
}

function terminalDecision(decision: RolloverDecision) {
  return decision === "TRANSFERRED_OUT" || decision === "WITHDRAWN" || decision === "GRADUATED";
}

function exitTypeForDecision(decision: RolloverDecision) {
  if (decision === "TRANSFERRED_OUT") return "TRANSFER";
  if (decision === "WITHDRAWN") return "WITHDRAW";
  if (decision === "GRADUATED") return "GRADUATE";
  return undefined;
}
