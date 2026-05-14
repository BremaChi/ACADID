import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { createAccessGrantSchema, createRecordRequestSchema, revokeAccessGrantSchema, type CreateRecordRequestInput } from "@acadid/shared";
import type { AuthTokenPayload } from "../../auth/types.js";
import { AuditService } from "../../platform/services/audit.service.js";
import { IdempotencyService } from "../../platform/services/idempotency.service.js";
import { PrismaService } from "../../platform/services/prisma.service.js";

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency?: IdempotencyService
  ) {}

  async passport(auth: AuthTokenPayload) {
    const learnerId = this.requireLearner(auth);
    const learner = await this.prisma.learner.findUnique({
      where: { uuid: learnerId },
      select: {
        ain: true,
        fullName: true,
        dateOfBirth: true,
        identityStatus: true,
        enrolments: {
          select: {
            studentNumber: true,
            level: true,
            programme: true,
            status: true,
            academicStanding: {
              select: {
                cgpa: true,
                gradePointMax: true,
                classification: true,
                classificationSystem: true,
                attemptedCreditUnits: true,
                earnedCreditUnits: true,
                includedRecordCount: true,
                periodCount: true,
                latestPeriodLabel: true,
                computedAt: true
              }
            },
            institution: {
              select: {
                institutionId: true,
                officialName: true
              }
            }
          }
        },
        recordRequests: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            requestId: true,
            institutionNameSubmitted: true,
            educationLevel: true,
            recordTypesRequested: true,
            status: true,
            paymentStatus: true,
            escrowStatus: true,
            amountMinor: true,
            currency: true,
            fulfilledAt: true,
            fulfilledCredential: {
              select: {
                credentialRef: true,
                type: true,
                status: true,
                issuedAt: true
              }
            }
          }
        }
      }
    });

    if (!learner) {
      throw new BadRequestException("Learner passport not found.");
    }

    return learner;
  }

  async academicStanding(auth: AuthTokenPayload) {
    const learnerId = this.requireLearner(auth);
    return this.prisma.academicStanding.findMany({
      where: { learnerId },
      orderBy: { computedAt: "desc" },
      select: {
        cgpa: true,
        gradePointMax: true,
        classification: true,
        classificationSystem: true,
        attemptedCreditUnits: true,
        earnedCreditUnits: true,
        qualityPoints: true,
        includedRecordCount: true,
        periodCount: true,
        latestPeriodLabel: true,
        computedAt: true,
        institution: {
          select: {
            institutionId: true,
            officialName: true
          }
        },
        enrolment: {
          select: {
            studentNumber: true,
            level: true,
            programme: true,
            status: true
          }
        }
      }
    });
  }

  async credentials(auth: AuthTokenPayload) {
    const learnerId = this.requireLearner(auth);
    return this.prisma.credential.findMany({
      where: { learnerId },
      orderBy: { issuedAt: "desc" },
      select: {
        credentialRef: true,
        type: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        revocationReason: true,
        recordRequest: {
          select: {
            requestId: true,
            recordTypesRequested: true,
            fulfilledAt: true
          }
        },
        institution: {
          select: {
            institutionId: true,
            officialName: true
          }
        }
      }
    });
  }

  async createShareLink(auth: AuthTokenPayload, body: unknown) {
    const learnerId = this.requireLearner(auth);
    const parsed = createAccessGrantSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const credential = await this.prisma.credential.findFirst({
      where: {
        credentialRef: parsed.data.credentialRef,
        learnerId
      }
    });

    if (!credential) {
      throw new BadRequestException("Credential not found for learner.");
    }

    if (credential.status !== "ACTIVE") {
      throw new BadRequestException("Only active credentials can be shared.");
    }

    const token = randomBytes(32).toString("base64url");
    const grant = await this.prisma.accessGrant.create({
      data: {
        learnerId,
        credentialId: credential.uuid,
        tokenHash: this.hashToken(token),
        scope: parsed.data.scope,
        recipientLabel: parsed.data.recipientLabel,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        maxViews: parsed.data.maxViews
      },
      select: {
        uuid: true,
        scope: true,
        recipientLabel: true,
        expiresAt: true,
        maxViews: true
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "access_grant.create",
      targetType: "AccessGrant",
      targetId: grant.uuid,
      outcome: "SUCCESS",
      metadata: {
        credentialRef: parsed.data.credentialRef,
        scope: grant.scope,
        recipientLabel: grant.recipientLabel
      }
    });

    return {
      accepted: true,
      accessGrantId: grant.uuid,
      token,
      verifyUrl: `/verify/${token}`,
      scope: grant.scope,
      recipientLabel: grant.recipientLabel,
      expiresAt: grant.expiresAt,
      maxViews: grant.maxViews
    };
  }

  async revokeGrant(auth: AuthTokenPayload, body: unknown) {
    const learnerId = this.requireLearner(auth);
    const parsed = revokeAccessGrantSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const grant = await this.prisma.accessGrant.update({
      where: { uuid: parsed.data.accessGrantId },
      data: { revokedAt: new Date() },
      select: {
        uuid: true,
        learnerId: true,
        revokedAt: true
      }
    });

    if (grant.learnerId !== learnerId) {
      throw new BadRequestException("Access Grant does not belong to learner.");
    }

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "access_grant.revoke",
      targetType: "AccessGrant",
      targetId: grant.uuid,
      outcome: "SUCCESS"
    });

    return { accepted: true, accessGrantId: grant.uuid, revokedAt: grant.revokedAt };
  }

  async verificationLog(auth: AuthTokenPayload) {
    const learnerId = this.requireLearner(auth);
    return this.prisma.verificationEvent.findMany({
      where: {
        credential: {
          learnerId
        }
      },
      orderBy: { verifiedAt: "desc" },
      take: 100,
      select: {
        uuid: true,
        verifierType: true,
        verifierName: true,
        outcome: true,
        verifiedAt: true,
        scopeViewed: true,
        credential: {
          select: {
            credentialRef: true,
            type: true,
            institution: {
              select: {
                institutionId: true,
                officialName: true
              }
            }
          }
        }
      }
    });
  }

  async createRecordRequest(auth: AuthTokenPayload, body: unknown, idempotencyKey?: string) {
    if (idempotencyKey && this.idempotency) {
      return this.idempotency.execute({
        scope: "access:record_request",
        key: idempotencyKey,
        operation: "record_request.create",
        request: body,
        auth,
        ttlHours: 72,
        handler: () => this.createRecordRequestRecord(auth, body)
      });
    }
    return this.createRecordRequestRecord(auth, body);
  }

  private async createRecordRequestRecord(auth: AuthTokenPayload, body: unknown) {
    const learnerId = this.requireLearner(auth);
    const parsed = createRecordRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    if (parsed.data.learnerId && parsed.data.learnerId !== learnerId) {
      throw new BadRequestException("Record request learnerId must match the authenticated learner.");
    }

    const amountMinor = this.recordRequestFeeMinor();
    const request = await this.prisma.recordRequest.create({
      data: {
        requestId: await this.nextRecordRequestId(),
        learnerId,
        institutionId: parsed.data.institutionId,
        institutionNameSubmitted: parsed.data.institutionNameSubmitted,
        educationLevel: parsed.data.educationLevel,
        yearsAttendedFrom: parsed.data.yearsAttendedFrom,
        yearsAttendedTo: parsed.data.yearsAttendedTo,
        studentNumber: parsed.data.studentNumber,
        departmentOrClass: parsed.data.departmentOrClass,
        recordTypesRequested: parsed.data.recordTypesRequested,
        proofDocumentUrls: parsed.data.proofDocumentUrls,
        requesterName: parsed.data.requesterName ?? auth.fullName,
        requesterEmail: parsed.data.requesterEmail ?? auth.email,
        status: amountMinor > 0 ? "AWAITING_PAYMENT" : "SUBMITTED",
        paymentStatus: amountMinor > 0 ? "PENDING" : "NOT_REQUIRED",
        escrowStatus: "NONE",
        amountMinor: amountMinor > 0 ? amountMinor : undefined,
        currency: "NGN",
        notes: []
      },
      include: this.recordRequestInclude()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "record_request.create",
      targetType: "RecordRequest",
      targetId: request.uuid,
      institutionId: request.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        requestId: request.requestId,
        recordTypesRequested: request.recordTypesRequested
      }
    });

    const invitationLead = await this.createInvitationLeadForUnregisteredInstitution(auth, request, parsed.data);

    return { accepted: true, request, invitationLead };
  }

  async listRecordRequests(auth: AuthTokenPayload) {
    const learnerId = this.requireLearner(auth);
    return this.prisma.recordRequest.findMany({
      where: { learnerId },
      include: this.recordRequestInclude(),
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  private requireLearner(auth: AuthTokenPayload): string {
    if (!auth.learnerId) {
      throw new BadRequestException("Authenticated account is not linked to a learner passport.");
    }

    return auth.learnerId;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async nextRecordRequestId() {
    const year = new Date().getUTCFullYear();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const suffix = randomBytes(4).toString("hex").toUpperCase();
      const requestId = `REQ-${year}-${suffix}`;
      const existing = await this.prisma.recordRequest.findUnique({ where: { requestId }, select: { uuid: true } });
      if (!existing) {
        return requestId;
      }
    }

    throw new BadRequestException("Could not allocate a record request ID.");
  }

  private async createInvitationLeadForUnregisteredInstitution(
    auth: AuthTokenPayload,
    request: { uuid: string; requestId: string; institutionId?: string | null },
    input: CreateRecordRequestInput
  ) {
    if (input.institutionId || request.institutionId) {
      return null;
    }

    const institutionName = input.institutionNameSubmitted.trim();
    const institutionNameKey = this.invitationLeadKey(institutionName);
    const existing = await this.prisma.invitationLead.findUnique({ where: { institutionNameKey } });
    const now = new Date();
    const requesterCountIncrement = input.requesterEmail || auth.email ? 1 : 0;
    const metadata = {
      source: "record_request",
      latestEducationLevel: input.educationLevel,
      latestRequesterEmail: input.requesterEmail ?? auth.email ?? null
    };

    const lead = existing
      ? await this.prisma.invitationLead.update({
          where: { uuid: existing.uuid },
          data: {
            demandCount: { increment: 1 },
            requesterCount: { increment: requesterCountIncrement },
            latestRecordRequestId: request.uuid,
            latestRecordRequestCode: request.requestId,
            recordRequestIds: Array.from(new Set([...existing.recordRequestIds, request.uuid])),
            educationLevel: input.educationLevel,
            lastRequestedAt: now,
            status: existing.status === "DISMISSED" ? "NEW" : existing.status,
            metadata
          }
        })
      : await this.prisma.invitationLead.create({
          data: {
            institutionName,
            institutionNameKey,
            educationLevel: input.educationLevel,
            demandCount: 1,
            requesterCount: requesterCountIncrement,
            latestRecordRequestId: request.uuid,
            latestRecordRequestCode: request.requestId,
            recordRequestIds: [request.uuid],
            lastRequestedAt: now,
            metadata
          }
        });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: existing ? "invitation_lead.update" : "invitation_lead.create",
      targetType: "InvitationLead",
      targetId: lead.uuid,
      outcome: "SUCCESS",
      metadata: {
        institutionName,
        requestId: request.requestId,
        demandCount: lead.demandCount
      }
    });

    return lead;
  }

  private invitationLeadKey(name: string) {
    const normalized = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);

    return normalized || createHash("sha256").update(name).digest("hex").slice(0, 32);
  }

  private recordRequestInclude() {
    return {
      institution: {
        select: {
          uuid: true,
          institutionId: true,
          officialName: true,
          state: true,
          status: true
        }
      },
      fulfilledCredential: {
        select: {
          credentialRef: true,
          type: true,
          status: true,
          issuedAt: true
        }
      }
    };
  }

  private recordRequestFeeMinor() {
    const raw = process.env.ACADID_RECORD_REQUEST_FEE_MINOR;
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
}
