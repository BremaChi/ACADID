import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { BackgroundJobType, Prisma, UserRole } from "@prisma/client";
import {
  createAcademicSessionSchema,
  createAcademicStructureSchema,
  createGradingRuleSetSchema,
  formatAin,
  ingestResultBatchSchema,
  ingestStudentRegisterSchema,
  updateAcademicSessionSchema,
  updateAcademicStructureSchema,
  updateGradingRuleSetSchema
} from "@acadid/shared";
import type { AuthTokenPayload } from "../../auth/types.js";
import { AuditService } from "../../platform/services/audit.service.js";
import { AuthorityService } from "../../platform/services/authority.service.js";
import { PrismaService } from "../../platform/services/prisma.service.js";
import { QueueService } from "../../platform/services/queue.service.js";

type GradingScaleBand = {
  minScore: number;
  maxScore?: number;
  grade: string;
  remark?: string;
  gradePoint?: number;
  pass?: boolean;
};

type ResolvedGradingRule = {
  uuid?: string;
  name: string;
  engine: "PRIMARY_SECONDARY" | "TERTIARY_GPA";
  source: "CONFIGURED" | "DEFAULT_FALLBACK";
  scale: GradingScaleBand[];
  passMark?: number;
  maxScore: number;
  gradePointMax?: number;
};

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: AuthorityService,
    private readonly audit: AuditService,
    private readonly queue: QueueService
  ) {}

  async ingestStudents(auth: AuthTokenPayload, body: unknown) {
    const parsed = ingestStudentRegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const authority = await this.authority.assertInstitutionCan(parsed.data.institutionId, "ingest_students", auth);
    const entryDate = new Date(parsed.data.entryDate ?? new Date().toISOString().slice(0, 10));
    const entryYear = entryDate.getUTCFullYear();

    const result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        let learnerSequence = await tx.learner.count();
        let createdLearners = 0;
        let linkedLearners = 0;
        let createdEnrolments = 0;
        let existingEnrolments = 0;
        const rows = [];

        for (const row of parsed.data.rows) {
          const existingEnrolment = await tx.enrolment.findFirst({
            where: {
              institutionId: authority.institutionUuid,
              studentNumber: row.studentNumber,
              status: "ACTIVE"
            },
            include: { learner: true }
          });

          if (existingEnrolment) {
            existingEnrolments += 1;
            rows.push({
              studentNumber: row.studentNumber,
              ain: existingEnrolment.learner.ain,
              status: "already_enrolled"
            });
            continue;
          }

          const dateOfBirth = new Date(row.dateOfBirth);
          let learner = await tx.learner.findFirst({
            where: {
              fullName: row.fullName,
              dateOfBirth
            }
          });

          if (!learner) {
            learnerSequence += 1;
            learner = await tx.learner.create({
              data: {
                ain: formatAin("NG", entryYear, learnerSequence),
                fullName: row.fullName,
                dateOfBirth,
                phone: row.phone,
                identityStatus: "UNVERIFIED"
              }
            });
            createdLearners += 1;
          } else {
            linkedLearners += 1;
          }

          await tx.enrolment.create({
            data: {
              learnerId: learner.uuid,
              institutionId: authority.institutionUuid,
              studentNumber: row.studentNumber,
              level: row.level,
              programme: row.programme,
              entryDate
            }
          });
          createdEnrolments += 1;
          rows.push({
            studentNumber: row.studentNumber,
            ain: learner.ain,
            status: "enrolled"
          });
        }

        return { createdLearners, linkedLearners, createdEnrolments, existingEnrolments, rows };
      },
      { maxWait: 20000, timeout: 60000 }
    );

    await this.audit.write({
      actorId: auth.kind === "API_KEY" ? undefined : auth.sub,
      actorRole: auth.kind === "API_KEY" ? undefined : auth.role,
      action: "ingest.students",
      targetType: "Institution",
      targetId: authority.institutionUuid,
      institutionId: authority.institutionUuid,
      outcome: "SUCCESS",
      metadata: {
        apiKeyId: auth.apiKeyId,
        authorityGrantId: authority.authorityGrantId,
        createdLearners: result.createdLearners,
        linkedLearners: result.linkedLearners,
        createdEnrolments: result.createdEnrolments,
        existingEnrolments: result.existingEnrolments
      }
    });

    return {
      accepted: true,
      institutionId: authority.institutionId,
      ...result
    };
  }

  async createAcademicSession(auth: AuthTokenPayload, body: unknown) {
    const parsed = createAcademicSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const institution = await this.resolveHumanInstitution(auth, parsed.data.institutionId);
    const session = await this.prisma.$transaction(async (tx) => {
      if (parsed.data.isCurrent) {
        await tx.academicSession.updateMany({
          where: { institutionId: institution.uuid, isCurrent: true },
          data: { isCurrent: false }
        });
      }

      return tx.academicSession.create({
        data: {
          institutionId: institution.uuid,
          sessionLabel: parsed.data.sessionLabel.trim(),
          periodType: parsed.data.periodType,
          periodLabel: parsed.data.periodLabel.trim(),
          startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
          endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
          status: parsed.data.status,
          isCurrent: parsed.data.isCurrent,
          createdById: auth.institutionUserId
        }
      });
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "academic_session.create",
      targetType: "AcademicSession",
      targetId: session.uuid,
      institutionId: institution.uuid,
      outcome: "SUCCESS",
      metadata: {
        sessionLabel: session.sessionLabel,
        periodType: session.periodType,
        periodLabel: session.periodLabel,
        status: session.status,
        isCurrent: session.isCurrent
      }
    });

    return { accepted: true, session };
  }

  async listAcademicSessions(auth: AuthTokenPayload, institutionRef?: string) {
    const where = await this.academicSetupWhere(auth, institutionRef);
    return this.prisma.academicSession.findMany({
      where,
      orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
      take: 200
    });
  }

  async updateAcademicSession(auth: AuthTokenPayload, id: string, body: unknown) {
    const parsed = updateAcademicSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existing = await this.prisma.academicSession.findUnique({ where: { uuid: id } });
    if (!existing) {
      throw new BadRequestException("Academic session not found.");
    }
    await this.resolveHumanInstitution(auth, existing.institutionId);

    const session = await this.prisma.$transaction(async (tx) => {
      if (parsed.data.isCurrent) {
        await tx.academicSession.updateMany({
          where: { institutionId: existing.institutionId, isCurrent: true, NOT: { uuid: id } },
          data: { isCurrent: false }
        });
      }

      return tx.academicSession.update({
        where: { uuid: id },
        data: {
          sessionLabel: parsed.data.sessionLabel?.trim(),
          periodType: parsed.data.periodType,
          periodLabel: parsed.data.periodLabel?.trim(),
          startDate: parsed.data.startDate === null ? null : parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
          endDate: parsed.data.endDate === null ? null : parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
          status: parsed.data.status,
          isCurrent: parsed.data.isCurrent
        }
      });
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "academic_session.update",
      targetType: "AcademicSession",
      targetId: session.uuid,
      institutionId: session.institutionId,
      outcome: "SUCCESS",
      metadata: {
        status: session.status,
        isCurrent: session.isCurrent
      }
    });

    return { accepted: true, session };
  }

  async createAcademicStructure(auth: AuthTokenPayload, body: unknown) {
    const parsed = createAcademicStructureSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const institution = await this.resolveHumanInstitution(auth, parsed.data.institutionId);
    await this.assertParentStructure(institution.uuid, parsed.data.parentId);

    const structure = await this.prisma.academicStructure.create({
      data: {
        institutionId: institution.uuid,
        parentId: parsed.data.parentId,
        type: parsed.data.type,
        name: parsed.data.name.trim(),
        code: parsed.data.code?.trim(),
        creditUnits: parsed.data.creditUnits,
        metadata: (parsed.data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        status: parsed.data.status,
        createdById: auth.institutionUserId
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "academic_structure.create",
      targetType: "AcademicStructure",
      targetId: structure.uuid,
      institutionId: institution.uuid,
      outcome: "SUCCESS",
      metadata: {
        type: structure.type,
        name: structure.name,
        parentId: structure.parentId
      }
    });

    return { accepted: true, structure };
  }

  async listAcademicStructures(auth: AuthTokenPayload, filters: { institutionId?: string; parentId?: string; type?: string }) {
    const where = await this.academicSetupWhere(auth, filters.institutionId);
    return this.prisma.academicStructure.findMany({
      where: {
        ...where,
        ...(filters.parentId ? { parentId: filters.parentId } : {}),
        ...(filters.type ? { type: filters.type as Prisma.EnumAcademicStructureTypeFilter<"AcademicStructure"> } : {})
      },
      orderBy: [{ parentId: "asc" }, { type: "asc" }, { name: "asc" }],
      take: 500
    });
  }

  async updateAcademicStructure(auth: AuthTokenPayload, id: string, body: unknown) {
    const parsed = updateAcademicStructureSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existing = await this.prisma.academicStructure.findUnique({ where: { uuid: id } });
    if (!existing) {
      throw new BadRequestException("Academic structure not found.");
    }
    await this.resolveHumanInstitution(auth, existing.institutionId);
    if (parsed.data.parentId && parsed.data.parentId === id) {
      throw new BadRequestException("Academic structure cannot be its own parent.");
    }
    await this.assertParentStructure(existing.institutionId, parsed.data.parentId ?? undefined);

    const structure = await this.prisma.academicStructure.update({
      where: { uuid: id },
      data: {
        parentId: parsed.data.parentId,
        type: parsed.data.type,
        name: parsed.data.name?.trim(),
        code: parsed.data.code === null ? null : parsed.data.code?.trim(),
        creditUnits: parsed.data.creditUnits,
        metadata:
          parsed.data.metadata === null
            ? Prisma.JsonNull
            : ((parsed.data.metadata ?? undefined) as Prisma.InputJsonValue | undefined),
        status: parsed.data.status
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "academic_structure.update",
      targetType: "AcademicStructure",
      targetId: structure.uuid,
      institutionId: structure.institutionId,
      outcome: "SUCCESS",
      metadata: {
        type: structure.type,
        status: structure.status,
        parentId: structure.parentId
      }
    });

    return { accepted: true, structure };
  }

  async createGradingRuleSet(auth: AuthTokenPayload, body: unknown) {
    const parsed = createGradingRuleSetSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const institution = await this.resolveHumanInstitution(auth, parsed.data.institutionId);
    const scale = this.normalizeScale(parsed.data.scale, parsed.data.maxScore);

    const ruleSet = await this.prisma.gradingRuleSet.create({
      data: {
        institutionId: institution.uuid,
        name: parsed.data.name.trim(),
        engine: parsed.data.engine,
        status: parsed.data.status,
        scale: scale as unknown as Prisma.InputJsonValue,
        passMark: parsed.data.passMark,
        maxScore: parsed.data.maxScore,
        gradePointMax: parsed.data.gradePointMax,
        effectiveFrom: parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : undefined,
        effectiveTo: parsed.data.effectiveTo ? new Date(parsed.data.effectiveTo) : undefined,
        createdById: auth.institutionUserId
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "grading_rule_set.create",
      targetType: "GradingRuleSet",
      targetId: ruleSet.uuid,
      institutionId: institution.uuid,
      outcome: "SUCCESS",
      metadata: {
        name: ruleSet.name,
        engine: ruleSet.engine,
        status: ruleSet.status,
        scaleBands: scale.length
      }
    });

    return { accepted: true, ruleSet };
  }

  async listGradingRuleSets(auth: AuthTokenPayload, institutionRef?: string) {
    const where = await this.academicSetupWhere(auth, institutionRef);
    return this.prisma.gradingRuleSet.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100
    });
  }

  async updateGradingRuleSet(auth: AuthTokenPayload, id: string, body: unknown) {
    const parsed = updateGradingRuleSetSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existing = await this.prisma.gradingRuleSet.findUnique({ where: { uuid: id } });
    if (!existing) {
      throw new BadRequestException("Grading rule set not found.");
    }
    await this.resolveHumanInstitution(auth, existing.institutionId);

    const nextMaxScore = parsed.data.maxScore ?? Number(existing.maxScore);
    const scale = parsed.data.scale ? this.normalizeScale(parsed.data.scale, nextMaxScore) : undefined;
    const ruleSet = await this.prisma.gradingRuleSet.update({
      where: { uuid: id },
      data: {
        name: parsed.data.name?.trim(),
        engine: parsed.data.engine,
        status: parsed.data.status,
        scale: scale ? (scale as unknown as Prisma.InputJsonValue) : undefined,
        passMark: parsed.data.passMark,
        maxScore: parsed.data.maxScore,
        gradePointMax: parsed.data.gradePointMax,
        effectiveFrom: parsed.data.effectiveFrom === null ? null : parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : undefined,
        effectiveTo: parsed.data.effectiveTo === null ? null : parsed.data.effectiveTo ? new Date(parsed.data.effectiveTo) : undefined
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "grading_rule_set.update",
      targetType: "GradingRuleSet",
      targetId: ruleSet.uuid,
      institutionId: ruleSet.institutionId,
      outcome: "SUCCESS",
      metadata: {
        engine: ruleSet.engine,
        status: ruleSet.status
      }
    });

    return { accepted: true, ruleSet };
  }

  async ingestResults(auth: AuthTokenPayload, body: unknown) {
    const parsed = ingestResultBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const authority = await this.authority.assertInstitutionCan(parsed.data.institutionId, "ingest_results", auth);
    await this.assertBatchScopeBelongsToInstitution(authority.institutionUuid, parsed.data.academicSessionId, parsed.data.structureScopeId);
    await this.authority.assertActorAssignedScope(auth, {
      institutionId: authority.institutionUuid,
      structureScopeId: parsed.data.structureScopeId,
      target: {
        upload_mode: parsed.data.uploadMode,
        period_type: parsed.data.rows[0]?.periodType,
        period_label: parsed.data.rows[0]?.periodLabel,
        subject: parsed.data.rows[0]?.subjectName,
        subject_code: parsed.data.rows[0]?.subjectCode
      }
    });
    if (auth.kind !== "API_KEY" && parsed.data.createdById !== auth.sub) {
      throw new BadRequestException("Result batch creator must match the authenticated user.");
    }
    const createdById = parsed.data.createdById ?? auth.sub;

    const studentNumbers = [...new Set(parsed.data.rows.map((row) => row.studentNumber))];
    const enrolments = await this.prisma.enrolment.findMany({
      where: {
        institutionId: authority.institutionUuid,
        studentNumber: { in: studentNumbers },
        status: "ACTIVE"
      }
    });
    const enrolmentByStudentNumber = new Map(enrolments.map((enrolment) => [enrolment.studentNumber, enrolment]));
    const missingStudents = studentNumbers.filter((studentNumber) => !enrolmentByStudentNumber.has(studentNumber));

    if (missingStudents.length > 0) {
      throw new BadRequestException({
        message: "Some result rows reference students without active enrolments.",
        missingStudents
      });
    }

    const gradingRule = await this.resolveGradingRule(
      authority.institutionUuid,
      parsed.data.uploadMode,
      parsed.data.gradingRuleSetId
    );
    const grading = this.gradeRows(parsed.data.rows, gradingRule);

    const batch = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const resultBatch = await tx.resultBatch.create({
          data: {
            institutionId: authority.institutionUuid,
            academicSessionId: parsed.data.academicSessionId,
            structureScopeId: parsed.data.structureScopeId,
            gradingRuleSetId: gradingRule.uuid,
            uploadMode: parsed.data.uploadMode,
            title: parsed.data.title,
            batchLabel: parsed.data.batchLabel,
            createdById,
            createdByInstitutionUserId: auth.kind === "API_KEY" ? undefined : auth.institutionUserId,
            recordCount: parsed.data.rows.length,
            validationSummary: {
              acceptedRows: parsed.data.rows.length,
              rejectedRows: 0,
              warnings: grading.warnings,
              grading: grading.summary
            } as Prisma.InputJsonValue
          }
        });

        await tx.academicRecord.createMany({
          data: grading.rows.map((gradedRow) => {
            const row = gradedRow.row;
            const enrolment = enrolmentByStudentNumber.get(row.studentNumber);
            if (!enrolment) {
              throw new BadRequestException("Result row references an unknown enrolment.");
            }

            return {
              enrolmentId: enrolment.uuid,
              resultBatchId: resultBatch.uuid,
              academicSessionId: parsed.data.academicSessionId,
              structureScopeId: parsed.data.structureScopeId,
              gradingRuleSetId: gradingRule.uuid,
              periodType: row.periodType,
              periodLabel: row.periodLabel,
              subjectCode: row.subjectCode,
              subjectName: row.subjectName,
              caScore: row.caScore,
              examScore: row.examScore,
              totalScore: row.totalScore,
              grade: gradedRow.grade,
              gradePoint: gradedRow.gradePoint,
              creditUnits: gradedRow.creditUnits,
              qualityPoints: gradedRow.qualityPoints,
              status: "DRAFT"
            };
          })
        });

        return resultBatch;
      },
      { maxWait: 20000, timeout: 60000 }
    );

    await this.audit.write({
      action: "ingest.results",
      targetType: "ResultBatch",
      targetId: batch.uuid,
      actorId: auth.kind === "API_KEY" ? undefined : createdById,
      actorRole: auth.kind === "API_KEY" ? undefined : auth.role,
      institutionId: authority.institutionUuid,
      outcome: "SUCCESS",
      metadata: {
        apiKeyId: auth.apiKeyId,
        authorityGrantId: authority.authorityGrantId,
        rowCount: parsed.data.rows.length,
        academicSessionId: parsed.data.academicSessionId,
        structureScopeId: parsed.data.structureScopeId,
        uploadMode: parsed.data.uploadMode,
        gradingRuleSetId: gradingRule.uuid,
        gradingRuleSource: gradingRule.source,
        gpa: grading.summary.gpa
      }
    });

    return {
      accepted: true,
      institutionId: authority.institutionId,
      batchId: batch.uuid,
      status: batch.status,
      academicSessionId: batch.academicSessionId,
      structureScopeId: batch.structureScopeId,
      uploadMode: batch.uploadMode,
      gradingRuleSetId: batch.gradingRuleSetId,
      gradingSummary: grading.summary,
      rowCount: parsed.data.rows.length
    };
  }

  async queueResultBatchValidation(auth: AuthTokenPayload, body: unknown, idempotencyKey?: string) {
    const parsed = ingestResultBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const authority = await this.authority.assertInstitutionCan(parsed.data.institutionId, "ingest_results", auth);
    await this.assertBatchScopeBelongsToInstitution(
      authority.institutionUuid,
      parsed.data.academicSessionId,
      parsed.data.structureScopeId
    );
    await this.authority.assertActorAssignedScope(auth, {
      institutionId: authority.institutionUuid,
      structureScopeId: parsed.data.structureScopeId
    });

    const job = await this.queue.enqueueJob({
      type: BackgroundJobType.RESULT_BATCH_VALIDATION,
      institutionId: authority.institutionUuid,
      createdById: auth.kind === "API_KEY" ? undefined : auth.sub,
      relatedEntityType: "ResultBatchDraft",
      payload: this.toJson({
        request: parsed.data,
        requestedBy: this.requestedBy(auth),
        authorityGrantId: authority.authorityGrantId
      }),
      eventType: "result_batch.validation_queued",
      eventPayload: this.toJson({
        institutionId: authority.institutionId,
        academicSessionId: parsed.data.academicSessionId ?? null,
        structureScopeId: parsed.data.structureScopeId ?? null,
        rowCount: parsed.data.rows.length
      }),
      idempotencyKey,
      idempotencyScope: "gateway:ingest:results_async"
    });

    return {
      accepted: true,
      door: "ingestion",
      operation: "result-batch-validation",
      processing: "QUEUED",
      institutionId: authority.institutionId,
      rowCount: parsed.data.rows.length,
      job
    };
  }

  async createBulkUpload(auth: AuthTokenPayload, body: unknown, idempotencyKey?: string) {
    const institutionRef = this.resolveBulkUploadInstitutionRef(auth, body);
    const authority = await this.authority.assertInstitutionCan(institutionRef, "ingest_students", auth);

    const job = await this.queue.enqueueJob({
      type: BackgroundJobType.BULK_STUDENT_UPLOAD,
      institutionId: authority.institutionUuid,
      createdById: auth.kind === "API_KEY" ? undefined : auth.sub,
      relatedEntityType: "ImportFile",
      payload: this.toJson({
        request: body,
        requestedBy: this.requestedBy(auth),
        authorityGrantId: authority.authorityGrantId
      }),
      eventType: "bulk_student_upload.queued",
      eventPayload: this.toJson({
        institutionId: authority.institutionId,
        submittedAt: new Date().toISOString()
      }),
      idempotencyKey,
      idempotencyScope: "gateway:ingest:bulk_upload"
    });

    return {
      accepted: true,
      door: "ingestion",
      operation: "bulk-upload",
      processing: "QUEUED",
      institutionId: authority.institutionId,
      job
    };
  }

  async listBatches(auth: AuthTokenPayload) {
    const institutionWhere = await this.authority.institutionWhereForActor(auth);
    return this.prisma.resultBatch.findMany({
      where: institutionWhere,
      orderBy: { createdAt: "desc" }
    });
  }

  async readBatch(auth: AuthTokenPayload, id: string) {
    const batch = await this.prisma.resultBatch.findUnique({
      where: { uuid: id },
      include: { academicRecords: true }
    });

    if (!batch) {
      throw new BadRequestException("Result batch not found.");
    }

    await this.authority.assertActorCanOperateInstitution(auth, batch.institutionId);
    return batch;
  }

  private async academicSetupWhere(auth: AuthTokenPayload, institutionRef?: string) {
    if (institutionRef) {
      const institution = await this.resolveReadableInstitution(auth, institutionRef);
      return { institutionId: institution.uuid };
    }

    const scoped = await this.authority.institutionWhereForActor(auth);
    return scoped ?? {};
  }

  private async resolveHumanInstitution(auth: AuthTokenPayload, institutionRef: string) {
    if (auth.kind === "API_KEY") {
      throw new ForbiddenException("Human institution session is required for academic setup.");
    }

    const institution = await this.resolveReadableInstitution(auth, institutionRef);
    await this.authority.assertActorCanOperateInstitution(auth, institution.uuid);
    return institution;
  }

  private async resolveReadableInstitution(auth: AuthTokenPayload, institutionRef: string) {
    const institution = await this.prisma.institution.findFirst({
      where: this.institutionRefWhere(institutionRef),
      select: { uuid: true, institutionId: true, officialName: true, status: true }
    });
    if (!institution || institution.status !== "ACTIVE") {
      throw new BadRequestException("Active institution not found.");
    }

    if (auth.role !== UserRole.ACADID_SUPER_ADMIN) {
      await this.authority.assertActorCanOperateInstitution(auth, institution.uuid);
    }
    return institution;
  }

  private async assertParentStructure(institutionId: string, parentId?: string | null) {
    if (!parentId) {
      return;
    }

    const parent = await this.prisma.academicStructure.findUnique({
      where: { uuid: parentId },
      select: { institutionId: true }
    });
    if (!parent || parent.institutionId !== institutionId) {
      throw new BadRequestException("Parent academic structure must belong to the same institution.");
    }
  }

  private async assertBatchScopeBelongsToInstitution(institutionId: string, academicSessionId?: string, structureScopeId?: string) {
    const [session, structure] = await Promise.all([
      academicSessionId
        ? this.prisma.academicSession.findUnique({ where: { uuid: academicSessionId }, select: { institutionId: true, status: true } })
        : Promise.resolve(null),
      structureScopeId
        ? this.prisma.academicStructure.findUnique({ where: { uuid: structureScopeId }, select: { institutionId: true, status: true } })
        : Promise.resolve(null)
    ]);

    if (academicSessionId && (!session || session.institutionId !== institutionId || session.status === "SEALED")) {
      throw new BadRequestException("Academic session must belong to the institution and must not be sealed.");
    }
    if (structureScopeId && (!structure || structure.institutionId !== institutionId || structure.status !== "ACTIVE")) {
      throw new BadRequestException("Academic structure scope must be active and belong to the institution.");
    }
  }

  private async resolveGradingRule(institutionId: string, uploadMode: string, gradingRuleSetId?: string): Promise<ResolvedGradingRule> {
    const expectedEngine = uploadMode === "COURSE_BASED" ? "TERTIARY_GPA" : "PRIMARY_SECONDARY";

    if (gradingRuleSetId) {
      const ruleSet = await this.prisma.gradingRuleSet.findUnique({ where: { uuid: gradingRuleSetId } });
      if (!ruleSet || ruleSet.institutionId !== institutionId || ruleSet.status === "ARCHIVED") {
        throw new BadRequestException("Active grading rule set must belong to the institution.");
      }
      return {
        uuid: ruleSet.uuid,
        name: ruleSet.name,
        engine: ruleSet.engine,
        source: "CONFIGURED",
        scale: this.normalizeScale(ruleSet.scale, Number(ruleSet.maxScore)),
        passMark: ruleSet.passMark === null ? undefined : Number(ruleSet.passMark),
        maxScore: Number(ruleSet.maxScore),
        gradePointMax: ruleSet.gradePointMax === null ? undefined : Number(ruleSet.gradePointMax)
      };
    }

    const ruleSet = await this.prisma.gradingRuleSet.findFirst({
      where: {
        institutionId,
        engine: expectedEngine,
        status: "ACTIVE"
      },
      orderBy: [{ effectiveFrom: "desc" }, { updatedAt: "desc" }]
    });

    if (ruleSet) {
      return {
        uuid: ruleSet.uuid,
        name: ruleSet.name,
        engine: ruleSet.engine,
        source: "CONFIGURED",
        scale: this.normalizeScale(ruleSet.scale, Number(ruleSet.maxScore)),
        passMark: ruleSet.passMark === null ? undefined : Number(ruleSet.passMark),
        maxScore: Number(ruleSet.maxScore),
        gradePointMax: ruleSet.gradePointMax === null ? undefined : Number(ruleSet.gradePointMax)
      };
    }

    return this.defaultGradingRule(expectedEngine);
  }

  private gradeRows<T extends { totalScore: number; grade?: string; creditUnits?: number; studentNumber: string }>(
    rows: T[],
    rule: ResolvedGradingRule
  ) {
    const warnings: Array<Record<string, unknown>> = [];
    let attemptedCreditUnits = 0;
    let earnedCreditUnits = 0;
    let qualityPoints = 0;

    const gradedRows = rows.map((row, index) => {
      if (row.totalScore > rule.maxScore) {
        warnings.push({
          row: index + 1,
          studentNumber: row.studentNumber,
          code: "SCORE_ABOVE_MAX",
          message: `Total score ${row.totalScore} is above grading max score ${rule.maxScore}.`
        });
      }

      const band = this.findBand(row.totalScore, rule.scale);
      if (!band) {
        throw new BadRequestException({
          message: "Result score does not match any configured grading band.",
          row: index + 1,
          studentNumber: row.studentNumber,
          totalScore: row.totalScore
        });
      }

      if (row.grade && row.grade.trim().toUpperCase() !== band.grade.trim().toUpperCase()) {
        warnings.push({
          row: index + 1,
          studentNumber: row.studentNumber,
          code: "UPLOADED_GRADE_OVERRIDDEN",
          uploadedGrade: row.grade,
          computedGrade: band.grade
        });
      }

      const creditUnits = row.creditUnits;
      const gradePoint = band.gradePoint;
      const rowQualityPoints = creditUnits !== undefined && gradePoint !== undefined ? this.round(creditUnits * gradePoint, 4) : undefined;

      if (rule.engine === "TERTIARY_GPA" && creditUnits !== undefined && gradePoint !== undefined) {
        attemptedCreditUnits += creditUnits;
        qualityPoints += rowQualityPoints ?? 0;
        if (band.pass ?? row.totalScore >= (rule.passMark ?? 0)) {
          earnedCreditUnits += creditUnits;
        }
      }

      return {
        row,
        grade: band.grade,
        gradePoint,
        creditUnits,
        qualityPoints: rowQualityPoints
      };
    });

    if (rule.source === "DEFAULT_FALLBACK") {
      warnings.push({
        code: "DEFAULT_GRADING_RULE_USED",
        message: "No active configured grading rule set was found, so AcadID used the MVP fallback scale."
      });
    }

    const gpa = attemptedCreditUnits > 0 ? this.round(qualityPoints / attemptedCreditUnits, 4) : undefined;
    return {
      rows: gradedRows,
      warnings,
      summary: {
        ruleSetId: rule.uuid ?? null,
        ruleSetName: rule.name,
        source: rule.source,
        engine: rule.engine,
        maxScore: rule.maxScore,
        gradePointMax: rule.gradePointMax ?? null,
        attemptedCreditUnits,
        earnedCreditUnits,
        qualityPoints: this.round(qualityPoints, 4),
        gpa: gpa ?? null
      }
    };
  }

  private normalizeScale(scale: unknown, maxScore = 100): GradingScaleBand[] {
    if (!Array.isArray(scale)) {
      throw new BadRequestException("Grading scale must be an array of bands.");
    }

    return scale
      .map((band) => {
        if (!band || typeof band !== "object") {
          throw new BadRequestException("Each grading scale band must be an object.");
        }
        const candidate = band as Partial<GradingScaleBand>;
        if (typeof candidate.minScore !== "number" || typeof candidate.grade !== "string") {
          throw new BadRequestException("Each grading scale band requires minScore and grade.");
        }

        return {
          minScore: candidate.minScore,
          maxScore: typeof candidate.maxScore === "number" ? candidate.maxScore : maxScore,
          grade: candidate.grade,
          remark: candidate.remark,
          gradePoint: candidate.gradePoint,
          pass: candidate.pass
        };
      })
      .sort((a, b) => b.minScore - a.minScore);
  }

  private findBand(totalScore: number, scale: GradingScaleBand[]) {
    return scale.find((band) => totalScore >= band.minScore && totalScore <= (band.maxScore ?? Number.POSITIVE_INFINITY));
  }

  private defaultGradingRule(engine: "PRIMARY_SECONDARY" | "TERTIARY_GPA"): ResolvedGradingRule {
    const baseScale = [
      { minScore: 70, maxScore: 100, grade: "A", gradePoint: engine === "TERTIARY_GPA" ? 5 : undefined, pass: true },
      { minScore: 60, maxScore: 69.99, grade: "B", gradePoint: engine === "TERTIARY_GPA" ? 4 : undefined, pass: true },
      { minScore: 50, maxScore: 59.99, grade: "C", gradePoint: engine === "TERTIARY_GPA" ? 3 : undefined, pass: true },
      { minScore: 45, maxScore: 49.99, grade: "D", gradePoint: engine === "TERTIARY_GPA" ? 2 : undefined, pass: true },
      { minScore: 40, maxScore: 44.99, grade: "E", gradePoint: engine === "TERTIARY_GPA" ? 1 : undefined, pass: true },
      { minScore: 0, maxScore: 39.99, grade: "F", gradePoint: engine === "TERTIARY_GPA" ? 0 : undefined, pass: false }
    ];

    return {
      name: engine === "TERTIARY_GPA" ? "AcadID MVP 5-point GPA fallback" : "AcadID MVP primary/secondary fallback",
      engine,
      source: "DEFAULT_FALLBACK",
      scale: baseScale,
      passMark: 40,
      maxScore: 100,
      gradePointMax: engine === "TERTIARY_GPA" ? 5 : undefined
    };
  }

  private round(value: number, precision: number) {
    const multiplier = 10 ** precision;
    return Math.round(value * multiplier) / multiplier;
  }

  private institutionRefWhere(institutionRef: string): Prisma.InstitutionWhereInput {
    return this.isUuid(institutionRef) ? { uuid: institutionRef } : { institutionId: institutionRef };
  }

  private resolveBulkUploadInstitutionRef(auth: AuthTokenPayload, body: unknown) {
    if (body && typeof body === "object" && "institutionId" in body) {
      const institutionId = (body as { institutionId?: unknown }).institutionId;
      if (typeof institutionId === "string" && institutionId.trim()) {
        return institutionId.trim();
      }
    }

    const tokenInstitution = auth.institutionId ?? auth.institutionUuid;
    if (tokenInstitution) {
      return tokenInstitution;
    }

    throw new BadRequestException("Bulk upload requires an institutionId.");
  }

  private requestedBy(auth: AuthTokenPayload) {
    return {
      kind: auth.kind ?? "USER",
      sub: auth.kind === "API_KEY" ? undefined : auth.sub,
      role: auth.role,
      institutionUserId: auth.institutionUserId,
      apiKeyId: auth.apiKeyId,
      clientId: auth.clientId,
      productCode: auth.productCode
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
  }
}
