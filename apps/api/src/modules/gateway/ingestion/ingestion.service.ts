import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { formatAin, ingestResultBatchSchema, ingestStudentRegisterSchema } from "@acadid/shared";
import type { AuthTokenPayload } from "../../auth/types.js";
import { AuditService } from "../../platform/services/audit.service.js";
import { AuthorityService } from "../../platform/services/authority.service.js";
import { PrismaService } from "../../platform/services/prisma.service.js";

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: AuthorityService,
    private readonly audit: AuditService
  ) {}

  async ingestStudents(auth: AuthTokenPayload, body: unknown) {
    const parsed = ingestStudentRegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const authority = await this.authority.assertInstitutionCan(parsed.data.institutionId, "ingest_students", auth);
    const entryDate = new Date(parsed.data.entryDate ?? new Date().toISOString().slice(0, 10));
    const entryYear = entryDate.getUTCFullYear();

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
    });

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

  async ingestResults(auth: AuthTokenPayload, body: unknown) {
    const parsed = ingestResultBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const authority = await this.authority.assertInstitutionCan(parsed.data.institutionId, "ingest_results", auth);
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

    const batch = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const resultBatch = await tx.resultBatch.create({
        data: {
          institutionId: authority.institutionUuid,
          title: parsed.data.title,
          createdById
        }
      });

      await tx.academicRecord.createMany({
        data: parsed.data.rows.map((row) => {
          const enrolment = enrolmentByStudentNumber.get(row.studentNumber);
          if (!enrolment) {
            throw new BadRequestException("Result row references an unknown enrolment.");
          }

          return {
            enrolmentId: enrolment.uuid,
            resultBatchId: resultBatch.uuid,
            periodType: row.periodType,
            periodLabel: row.periodLabel,
            subjectCode: row.subjectCode,
            subjectName: row.subjectName,
            caScore: row.caScore,
            examScore: row.examScore,
            totalScore: row.totalScore,
            grade: row.grade,
            status: "DRAFT"
          };
        })
      });

      return resultBatch;
    });

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
        rowCount: parsed.data.rows.length
      }
    });

    return {
      accepted: true,
      institutionId: authority.institutionId,
      batchId: batch.uuid,
      status: batch.status,
      rowCount: parsed.data.rows.length
    };
  }

  createBulkUpload(body: unknown) {
    return {
      accepted: true,
      door: "ingestion",
      operation: "bulk-upload",
      received: body
    };
  }

  async listBatches(auth: AuthTokenPayload) {
    const institutionIds = await this.authority.institutionIdsForActor(auth);
    return this.prisma.resultBatch.findMany({
      where: institutionIds ? { institutionId: { in: institutionIds } } : undefined,
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
}
