import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { BackgroundJobStatus, BackgroundJobType, InstitutionUserStatus, NotificationChannel, UserRole, WorkerHeartbeatStatus } from "@prisma/client";
import type {
  ApiKeyEnvironment,
  DeveloperAccessRequestStatus,
  DisputeStatus,
  InvitationLeadStatus,
  Prisma,
  RecordRequestStatus,
  RevenueCategory,
  RevenueEntryStatus,
  VerificationOutcome
} from "@prisma/client";
import {
  assignDisputeSchema,
  closeDisputeSchema,
  createAuthorityGrantSchema,
  createDeveloperAccessRequestSchema,
  createDisputeSchema,
  createInstitutionSchema,
  escalateDisputeSchema,
  platformSettingsSchema,
  reviewDeveloperAccessRequestSchema,
  sendDisputeNoticeSchema,
  updateInvitationLeadSchema
} from "@acadid/shared";
import type { AuthTokenPayload } from "../auth/types.js";
import { AuthService } from "../auth/auth.service.js";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../platform/services/prisma.service.js";
import { AuditService } from "../platform/services/audit.service.js";
import { CredentialSigningService } from "../platform/services/credential-signing.service.js";
import { CacheService } from "../platform/services/cache.service.js";
import { IdempotencyService } from "../platform/services/idempotency.service.js";
import { QueueService } from "../platform/services/queue.service.js";
import { defaultRateLimitPolicyControl, RateLimitService } from "../platform/services/rate-limit.service.js";
import { RetryPolicyService } from "../platform/services/retry-policy.service.js";
import { WebhookSecretService } from "../platform/services/webhook-secret.service.js";
import { ObjectStorageService } from "../jobs/object-storage.service.js";
import { StructuredLoggerService } from "../platform/services/structured-logger.service.js";

const allowedApiKeyScopes = new Set([
  "institution:apply",
  "ingest:write",
  "govern:write",
  "access:read",
  "verify:read",
  "identity:write",
  "webhook:manage",
  "*"
]);

type HealthStatus = "OPERATIONAL" | "DEGRADED" | "DOWN" | "PENDING_CONFIGURATION";
const revenueCategories: RevenueCategory[] = ["VERIFICATION_FEE", "CREDENTIAL_EXPORT_FEE", "INSTITUTION_SUBSCRIPTION"];
const billableRevenueStatuses: RevenueEntryStatus[] = ["BILLABLE", "INVOICED", "PAID"];
const defaultPlatformSettings = {
  approval: {
    requireMou: true,
    requireDocumentUpload: true,
    allowAutoApprove: false,
    maxApplicationReviewDays: 14
  },
  api: {
    defaultEnvironment: "SANDBOX",
    defaultRateLimitPerMinute: 1000,
    productKeyRotationDays: 180,
    institutionKeyRotationDays: 90
  },
  rateLimits: defaultRateLimitPolicyControl,
  notifications: {
    founderEmail: "founder@acadid.local",
    notifyOnNewApplication: true,
    notifyOnDeveloperRequest: true,
    notifyOnDispute: true,
    weeklySummaryEnabled: true
  },
  emailTemplates: {
    applicationApprovedSubject: "ACAD.ID institution application approved",
    applicationRejectedSubject: "ACAD.ID institution application update",
    developerAccessApprovedSubject: "ACAD.ID Developer Access approved",
    disputeNoticeSubject: "ACAD.ID credential dispute notice"
  }
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwordService: PasswordService,
    private readonly credentialSigning?: CredentialSigningService,
    private readonly cache?: CacheService,
    private readonly webhookSecrets?: WebhookSecretService,
    private readonly queue?: QueueService,
    private readonly rateLimit?: RateLimitService,
    private readonly idempotency?: IdempotencyService,
    @Optional() private readonly authService?: AuthService,
    @Optional() private readonly objectStorage?: ObjectStorageService,
    @Optional() private readonly structuredLogger?: StructuredLoggerService,
    private readonly retryPolicy: RetryPolicyService = new RetryPolicyService()
  ) {}

  async createInstitution(input: unknown) {
    const parsed = createInstitutionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const institution = await this.prisma.institution.create({
      data: {
        institutionId: await this.nextInstitutionDisplayId(),
        officialName: parsed.data.officialName,
        type: parsed.data.type,
        state: parsed.data.state,
        tier: parsed.data.tier
      }
    });

    await this.audit.write({
      action: "institution.create",
      targetType: "Institution",
      targetId: institution.uuid,
      institutionId: institution.uuid,
      outcome: "SUCCESS"
    });

    this.cache?.invalidateTag("institutions");
    return institution;
  }

  listInstitutions() {
    return (
      this.cache?.getOrSet("institutions:list:founder", () => this.readInstitutionList(), {
        ttlSeconds: 20,
        tags: ["institutions"]
      }) ?? this.readInstitutionList()
    );
  }

  private readInstitutionList() {
    return this.prisma.institution.findMany({
      orderBy: { createdAt: "desc" }
    });
  }

  async updateInstitutionStatus(id: string, status: "ACTIVE" | "SUSPENDED") {
    const institution = await this.prisma.institution.update({
      where: { uuid: id },
      data: { status }
    });

    await this.audit.write({
      action: "institution.status.update",
      targetType: "Institution",
      targetId: id,
      institutionId: id,
      outcome: "SUCCESS",
      metadata: { status }
    });

    this.cache?.invalidateTag("institutions");
    return institution;
  }

  async listInstitutionStaff(institutionId: string) {
    await this.assertInstitutionExists(institutionId);
    const staff = await this.prisma.institutionUser.findMany({
      where: { institutionId },
      include: {
        user: {
          select: {
            uuid: true,
            email: true,
            fullName: true,
            phone: true,
            mfaEnabled: true
          }
        },
        invitedBy: {
          select: {
            uuid: true,
            email: true,
            fullName: true
          }
        },
        institution: {
          select: {
            uuid: true,
            institutionId: true,
            officialName: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }]
    });

    return staff.map((member) => this.safeInstitutionStaff(member));
  }

  async inviteInstitutionStaff(auth: AuthTokenPayload, institutionId: string, input: unknown) {
    if (!this.authService) {
      throw new BadRequestException("Staff invitation service is not available.");
    }
    await this.assertInstitutionExists(institutionId);
    const body = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
    const invitation = await this.authService.inviteInstitutionUser(auth, {
      institutionId,
      email: typeof body.email === "string" ? body.email : undefined,
      fullName: typeof body.fullName === "string" ? body.fullName : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      role: typeof body.role === "string" ? body.role : undefined,
      permissions: this.parseStringArray(body.permissions, "permissions", 30, false),
      assignedScopes: this.parseAssignedScopes(body.assignedScopes)
    });
    return invitation;
  }

  async updateInstitutionStaff(auth: AuthTokenPayload, staffId: string, input: unknown) {
    const existing = await this.prisma.institutionUser.findUnique({
      where: { uuid: staffId },
      select: {
        uuid: true,
        institutionId: true,
        role: true,
        status: true,
        permissions: true,
        assignedScopes: true,
        twoFactorRequired: true
      }
    });
    if (!existing) {
      throw new BadRequestException("Institution staff member not found.");
    }

    const body = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
    const data: Prisma.InstitutionUserUpdateInput = {};
    if (typeof body.role === "string") {
      data.role = this.parseInstitutionUserRole(body.role);
    }
    if (typeof body.status === "string") {
      data.status = this.parseInstitutionUserStatus(body.status);
      data.suspendedAt = data.status === InstitutionUserStatus.SUSPENDED ? new Date() : null;
    }
    if (Array.isArray(body.permissions)) {
      data.permissions = this.parseStringArray(body.permissions, "permissions", 30, true);
    }
    if (Array.isArray(body.assignedScopes)) {
      data.assignedScopes = this.parseAssignedScopes(body.assignedScopes) as Prisma.InputJsonValue;
    }
    if (typeof body.twoFactorRequired === "boolean") {
      data.twoFactorRequired = body.twoFactorRequired;
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException("No staff fields were provided for update.");
    }

    const updated = await this.prisma.institutionUser.update({
      where: { uuid: staffId },
      data,
      include: {
        user: {
          select: {
            uuid: true,
            email: true,
            fullName: true,
            phone: true,
            mfaEnabled: true
          }
        },
        invitedBy: {
          select: {
            uuid: true,
            email: true,
            fullName: true
          }
        },
        institution: {
          select: {
            uuid: true,
            institutionId: true,
            officialName: true
          }
        }
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "institution_user.update",
      targetType: "InstitutionUser",
      targetId: staffId,
      institutionId: existing.institutionId,
      outcome: "SUCCESS",
      metadata: {
        previousStatus: existing.status,
        nextStatus: updated.status,
        previousRole: existing.role,
        nextRole: updated.role,
        permissionsUpdated: Array.isArray(body.permissions),
        assignedScopesUpdated: Array.isArray(body.assignedScopes),
        twoFactorRequired: updated.twoFactorRequired
      }
    });

    return this.safeInstitutionStaff(updated);
  }

  async createAuthorityGrant(institutionId: string, input: unknown) {
    const parsed = createAuthorityGrantSchema.safeParse({
      ...(typeof input === "object" && input ? input : {}),
      institutionId
    });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const grant = await this.prisma.authorityGrant.create({
      data: {
        institutionId,
        mouDocumentUrl: "pending-secure-storage-url",
        signedByName: parsed.data.signedByName,
        signedByTitle: parsed.data.signedByTitle,
        effectiveFrom: new Date(parsed.data.effectiveFrom),
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        permissions: parsed.data.permissions as Prisma.InputJsonValue
      }
    });

    await this.audit.write({
      action: "authority_grant.create",
      targetType: "AuthorityGrant",
      targetId: grant.uuid,
      institutionId,
      outcome: "SUCCESS"
    });

    return grant;
  }

  listInstitutionApplications(status?: "PENDING" | "APPROVED" | "REJECTED") {
    return this.prisma.institutionApplication.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async approveInstitutionApplication(auth: AuthTokenPayload, id: string) {
    const application = await this.prisma.institutionApplication.findUnique({
      where: { uuid: id }
    });
    if (!application) {
      throw new BadRequestException("Institution application not found.");
    }
    if (application.status !== "PENDING") {
      throw new BadRequestException("Only pending institution applications can be approved.");
    }

    const registrarInviteToken = this.createInviteToken();
    const registrarInviteTokenHash = this.hashInviteToken(registrarInviteToken);
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { institution, registrarInvite } = await this.prisma.$transaction(async (tx) => {
      const createdInstitution = await tx.institution.create({
        data: {
          institutionId: await this.nextInstitutionDisplayId(tx),
          officialName: application.officialName,
          type: this.mapApplicationType(application.type),
          state: application.state,
          tier: "FOUNDING",
          status: "ACTIVE",
          mouSignedAt: application.mouAcceptedAt
        }
      });

      await tx.institutionApplication.update({
        where: { uuid: application.uuid },
        data: {
          status: "APPROVED",
          reviewedById: auth.sub,
          reviewedAt: new Date(),
          approvedInstitutionId: createdInstitution.uuid
        }
      });

      const registrarUser = await tx.user.upsert({
        where: { email: application.contactEmail.trim().toLowerCase() },
        update: {
          fullName: application.contactPersonName.trim(),
          role: UserRole.REGISTRAR
        },
        create: {
          email: application.contactEmail.trim().toLowerCase(),
          fullName: application.contactPersonName.trim(),
          role: UserRole.REGISTRAR,
          passwordHash: this.passwordService.hash(randomBytes(32).toString("base64url"))
        }
      });

      const createdRegistrarInvite = await tx.institutionUser.upsert({
        where: {
          userId_institutionId_role: {
            userId: registrarUser.uuid,
            institutionId: createdInstitution.uuid,
            role: UserRole.REGISTRAR
          }
        },
        update: {
          status: "INVITED",
          permissions: this.defaultPermissionsForRole(UserRole.REGISTRAR),
          invitedById: auth.sub,
          inviteTokenHash: registrarInviteTokenHash,
          invitedAt: new Date(),
          inviteExpiresAt,
          inviteAcceptedAt: null,
          suspendedAt: null
        },
        create: {
          userId: registrarUser.uuid,
          institutionId: createdInstitution.uuid,
          role: UserRole.REGISTRAR,
          status: "INVITED",
          permissions: this.defaultPermissionsForRole(UserRole.REGISTRAR),
          invitedById: auth.sub,
          inviteTokenHash: registrarInviteTokenHash,
          invitedAt: new Date(),
          inviteExpiresAt
        },
        include: {
          user: {
            select: {
              uuid: true,
              email: true,
              fullName: true
            }
          }
        }
      });

      return {
        institution: createdInstitution,
        registrarInvite: createdRegistrarInvite
      };
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "institution_application.approve",
      targetType: "InstitutionApplication",
      targetId: id,
      institutionId: institution.uuid,
      outcome: "SUCCESS",
      metadata: {
        institutionId: institution.institutionId,
        applicationType: application.type,
        registrarInviteId: registrarInvite.uuid
      }
    });

    this.cache?.invalidateTag("institutions");
    return {
      accepted: true,
      applicationId: id,
      institution,
      registrarInvite: {
        id: registrarInvite.uuid,
        status: registrarInvite.status,
        inviteExpiresAt: registrarInvite.inviteExpiresAt,
        user: registrarInvite.user
      },
      inviteToken: registrarInviteToken,
      warning: "Registrar invite token is shown once for sandbox delivery. Route it through the email provider before pilot use."
    };
  }

  async rejectInstitutionApplication(auth: AuthTokenPayload, id: string, feedback?: string) {
    const application = await this.prisma.institutionApplication.update({
      where: { uuid: id },
      data: {
        status: "REJECTED",
        reviewedById: auth.sub,
        reviewedAt: new Date(),
        reviewFeedback: feedback?.trim() || null
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "institution_application.reject",
      targetType: "InstitutionApplication",
      targetId: id,
      outcome: "SUCCESS",
      reason: feedback
    });

    return application;
  }

  async requestInstitutionApplicationInfo(auth: AuthTokenPayload, id: string, message?: string) {
    const trimmedMessage = message?.trim();
    if (!trimmedMessage) {
      throw new BadRequestException("A request message is required.");
    }

    const application = await this.prisma.institutionApplication.findUnique({
      where: { uuid: id }
    });
    if (!application) {
      throw new BadRequestException("Institution application not found.");
    }
    if (application.status !== "PENDING") {
      throw new BadRequestException("More information can only be requested for pending applications.");
    }

    const updated = await this.prisma.institutionApplication.update({
      where: { uuid: id },
      data: {
        reviewFeedback: trimmedMessage,
        reviewedById: auth.sub,
        reviewedAt: new Date()
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "institution_application.request_info",
      targetType: "InstitutionApplication",
      targetId: id,
      outcome: "SUCCESS",
      reason: trimmedMessage
    });

    return updated;
  }

  async sendInstitutionApplicationEmail(auth: AuthTokenPayload, id: string, input: { subject?: string; message?: string }) {
    const subject = input?.subject?.trim() || "ACAD.ID institution application update";
    const message = input?.message?.trim();
    if (!message) {
      throw new BadRequestException("Email message is required.");
    }

    const application = await this.prisma.institutionApplication.findUnique({
      where: { uuid: id },
      select: { uuid: true, contactEmail: true, officialName: true, status: true }
    });
    if (!application) {
      throw new BadRequestException("Institution application not found.");
    }

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "institution_application.email.record",
      targetType: "InstitutionApplication",
      targetId: id,
      outcome: "SUCCESS",
      metadata: {
        subject,
        contactEmail: application.contactEmail,
        officialName: application.officialName,
        status: application.status
      }
    });

    return {
      accepted: true,
      applicationId: id,
      contactEmail: application.contactEmail,
      subject,
      delivery: "RECORDED_FOR_EMAIL_PROVIDER"
    };
  }

  listDeveloperAccessRequests(status?: DeveloperAccessRequestStatus) {
    return this.prisma.developerAccessRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        institution: {
          select: {
            uuid: true,
            institutionId: true,
            officialName: true,
            type: true,
            state: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async createDeveloperAccessRequest(auth: AuthTokenPayload, input: unknown) {
    const parsed = createDeveloperAccessRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const institution = await this.prisma.institution.findUnique({
      where: { uuid: parsed.data.institutionId },
      select: { uuid: true, institutionId: true, officialName: true, status: true }
    });
    if (!institution) {
      throw new BadRequestException("Institution not found.");
    }
    if (institution.status !== "ACTIVE") {
      throw new BadRequestException("Only active institutions can request developer access.");
    }

    const existingOpenRequest = await this.prisma.developerAccessRequest.findFirst({
      where: {
        institutionId: institution.uuid,
        status: { in: ["PENDING", "APPROVED"] }
      },
      select: { uuid: true, status: true }
    });
    if (existingOpenRequest) {
      throw new BadRequestException(`Institution already has a ${existingOpenRequest.status.toLowerCase()} developer access request.`);
    }

    const request = await this.prisma.developerAccessRequest.create({
      data: {
        institutionId: institution.uuid,
        requestedById: auth.kind === "API_KEY" ? undefined : auth.sub,
        developerName: parsed.data.developerName.trim(),
        developerEmail: parsed.data.developerEmail.trim().toLowerCase(),
        developerPhone: parsed.data.developerPhone?.trim(),
        reason: parsed.data.reason.trim(),
        requestedScopes: parsed.data.requestedScopes
      },
      include: {
        institution: {
          select: {
            uuid: true,
            institutionId: true,
            officialName: true,
            type: true,
            state: true,
            status: true
          }
        }
      }
    });

    await this.audit.write({
      actorId: auth.kind === "API_KEY" ? undefined : auth.sub,
      actorRole: auth.role,
      action: "developer_access_request.create",
      targetType: "DeveloperAccessRequest",
      targetId: request.uuid,
      institutionId: institution.uuid,
      outcome: "SUCCESS",
      metadata: {
        institutionId: institution.institutionId,
        requestedScopes: request.requestedScopes
      }
    });

    return request;
  }

  async approveDeveloperAccessRequest(auth: AuthTokenPayload, id: string, feedback?: string) {
    return this.reviewDeveloperAccessRequest(auth, id, "APPROVED", feedback);
  }

  async rejectDeveloperAccessRequest(auth: AuthTokenPayload, id: string, feedback?: string) {
    return this.reviewDeveloperAccessRequest(auth, id, "REJECTED", feedback);
  }

  async suspendDeveloperAccessRequest(auth: AuthTokenPayload, id: string, feedback?: string) {
    return this.reviewDeveloperAccessRequest(auth, id, "SUSPENDED", feedback);
  }

  listDisputes(status?: DisputeStatus) {
    return this.prisma.dispute.findMany({
      where: status ? { status } : undefined,
      include: this.disputeInclude(),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200
    });
  }

  async createDispute(auth: AuthTokenPayload, input: unknown) {
    const parsed = createDisputeSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        title: parsed.data.title.trim(),
        description: parsed.data.description.trim(),
        category: parsed.data.category.trim().toUpperCase(),
        priority: parsed.data.priority,
        institutionId: parsed.data.institutionId,
        learnerId: parsed.data.learnerId,
        credentialId: parsed.data.credentialId,
        reporterName: parsed.data.reporterName?.trim(),
        reporterEmail: parsed.data.reporterEmail?.trim().toLowerCase()
      },
      include: this.disputeInclude()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "dispute.create",
      targetType: "Dispute",
      targetId: dispute.uuid,
      institutionId: dispute.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        category: dispute.category,
        priority: dispute.priority
      }
    });

    return dispute;
  }

  async assignDispute(auth: AuthTokenPayload, id: string, input: unknown) {
    const parsed = assignDisputeSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const assignedToId = parsed.data.assignedToId ?? auth.sub;
    const dispute = await this.prisma.dispute.update({
      where: { uuid: id },
      data: { assignedToId },
      include: this.disputeInclude()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "dispute.assign",
      targetType: "Dispute",
      targetId: id,
      institutionId: dispute.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        assignedToId,
        assigneeName: parsed.data.assigneeName
      }
    });

    return dispute;
  }

  async sendDisputeNotice(auth: AuthTokenPayload, id: string, input: unknown) {
    const parsed = sendDisputeNoticeSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const dispute = await this.prisma.dispute.update({
      where: { uuid: id },
      data: {
        institutionNotice: parsed.data.message.trim(),
        noticeSentAt: new Date()
      },
      include: this.disputeInclude()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "dispute.notice.send",
      targetType: "Dispute",
      targetId: id,
      institutionId: dispute.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        delivery: "queued-placeholder"
      }
    });

    return dispute;
  }

  async escalateDispute(auth: AuthTokenPayload, id: string, input: unknown) {
    const parsed = escalateDisputeSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const dispute = await this.prisma.dispute.update({
      where: { uuid: id },
      data: {
        status: "ESCALATED",
        escalatedAt: new Date()
      },
      include: this.disputeInclude()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "dispute.escalate",
      targetType: "Dispute",
      targetId: id,
      institutionId: dispute.institutionId ?? undefined,
      outcome: "SUCCESS",
      reason: parsed.data.reason
    });

    return dispute;
  }

  async closeDispute(auth: AuthTokenPayload, id: string, input: unknown) {
    const parsed = closeDisputeSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const dispute = await this.prisma.dispute.update({
      where: { uuid: id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolutionNote: parsed.data.resolutionNote.trim()
      },
      include: this.disputeInclude()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "dispute.close",
      targetType: "Dispute",
      targetId: id,
      institutionId: dispute.institutionId ?? undefined,
      outcome: "SUCCESS",
      reason: parsed.data.resolutionNote
    });

    return dispute;
  }

  async listVerificationLogs(options: { outcome?: VerificationOutcome; search?: string } = {}) {
    const search = options.search?.trim();
    const searchWhere: Prisma.VerificationEventWhereInput | undefined = search
      ? {
          OR: [
            { verifierName: { contains: search, mode: "insensitive" } },
            {
              credential: {
                credentialRef: { contains: search, mode: "insensitive" }
              }
            },
            {
              credential: {
                learner: {
                  OR: [
                    { ain: { contains: search, mode: "insensitive" } },
                    { fullName: { contains: search, mode: "insensitive" } }
                  ]
                }
              }
            },
            {
              credential: {
                institution: {
                  OR: [
                    { institutionId: { contains: search, mode: "insensitive" } },
                    { officialName: { contains: search, mode: "insensitive" } },
                    { state: { contains: search, mode: "insensitive" } }
                  ]
                }
              }
            }
          ]
        }
      : undefined;

    const events = await this.prisma.verificationEvent.findMany({
      where: {
        ...(options.outcome ? { outcome: options.outcome } : {}),
        ...(searchWhere ?? {})
      },
      orderBy: { verifiedAt: "desc" },
      take: 500,
      select: {
        uuid: true,
        verifierType: true,
        verifierName: true,
        outcome: true,
        verifiedAt: true,
        scopeViewed: true,
        credential: {
          select: {
            uuid: true,
            credentialRef: true,
            type: true,
            status: true,
            learner: {
              select: {
                uuid: true,
                ain: true,
                fullName: true
              }
            },
            institution: {
              select: {
                uuid: true,
                institutionId: true,
                officialName: true,
                state: true
              }
            }
          }
        },
        accessGrant: {
          select: {
            uuid: true,
            scope: true,
            recipientLabel: true,
            revokedAt: true,
            expiresAt: true
          }
        }
      }
    });

    return events.map((event) => ({
      id: event.uuid,
      ain: event.credential.learner.ain,
      learnerName: event.credential.learner.fullName,
      institutionId: event.credential.institution.institutionId,
      institutionName: event.credential.institution.officialName,
      institutionState: event.credential.institution.state,
      verifier: event.verifierName ?? event.accessGrant?.recipientLabel ?? event.verifierType,
      verifierType: event.verifierType,
      credential: event.credential.credentialRef,
      credentialType: event.credential.type,
      credentialStatus: event.credential.status,
      outcome: event.outcome,
      scopeShown: this.describeScopeViewed(event.scopeViewed),
      accessGrantScope: event.accessGrant?.scope ?? null,
      verifiedAt: event.verifiedAt
    }));
  }

  async listRecordRequests(options: { status?: RecordRequestStatus; search?: string } = {}) {
    const search = options.search?.trim();
    return this.prisma.recordRequest.findMany({
      where: {
        ...(options.status ? { status: options.status } : {}),
        ...(search
          ? {
              OR: [
                { requestId: { contains: search, mode: "insensitive" } },
                { institutionNameSubmitted: { contains: search, mode: "insensitive" } },
                { studentNumber: { contains: search, mode: "insensitive" } },
                { requesterName: { contains: search, mode: "insensitive" } },
                { requesterEmail: { contains: search, mode: "insensitive" } },
                { learner: { ain: { contains: search, mode: "insensitive" } } },
                { learner: { fullName: { contains: search, mode: "insensitive" } } },
                { institution: { officialName: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: {
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
      },
      orderBy: { createdAt: "desc" },
      take: 250
    });
  }

  async listInvitationLeads(options: { status?: InvitationLeadStatus; search?: string } = {}) {
    const search = options.search?.trim();
    return this.prisma.invitationLead.findMany({
      where: {
        ...(options.status ? { status: options.status } : {}),
        ...(search
          ? {
              OR: [
                { institutionName: { contains: search, mode: "insensitive" } },
                { latestRecordRequestCode: { contains: search, mode: "insensitive" } },
                { educationLevel: { contains: search, mode: "insensitive" } },
                { stateHint: { contains: search, mode: "insensitive" } },
                { reviewNote: { contains: search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: [{ status: "asc" }, { demandCount: "desc" }, { lastRequestedAt: "desc" }],
      take: 250
    });
  }

  async updateInvitationLead(auth: AuthTokenPayload, id: string, body: unknown) {
    const parsed = updateInvitationLeadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existing = await this.prisma.invitationLead.findUnique({ where: { uuid: id } });
    if (!existing) {
      throw new BadRequestException("Invitation lead was not found.");
    }

    const now = new Date();
    const status = parsed.data.status ?? existing.status;
    const lead = await this.prisma.invitationLead.update({
      where: { uuid: id },
      data: {
        status,
        reviewNote: parsed.data.note ?? existing.reviewNote,
        sourceApplicationId: parsed.data.sourceApplicationId ?? existing.sourceApplicationId,
        convertedInstitutionId: parsed.data.convertedInstitutionId ?? existing.convertedInstitutionId,
        reviewedById: auth.sub,
        ...(status === "CONTACTED" ? { lastContactedAt: now } : {}),
        ...(status === "INVITED" ? { invitedAt: now } : {}),
        ...(status === "DISMISSED" ? { dismissedAt: now } : {}),
        ...(status === "CONVERTED" ? { convertedAt: now } : {})
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "invitation_lead.review",
      targetType: "InvitationLead",
      targetId: lead.uuid,
      outcome: "SUCCESS",
      metadata: {
        institutionName: lead.institutionName,
        previousStatus: existing.status,
        nextStatus: lead.status,
        latestRecordRequestCode: lead.latestRecordRequestCode
      }
    });

    return { accepted: true, lead };
  }

  async readDashboardSummary() {
    const generatedAt = new Date();
    const [
      totalInstitutions,
      activeInstitutions,
      suspendedInstitutions,
      pendingApplications,
      activeLearners,
      resultsPublished,
      credentialsIssued,
      activeApiKeys,
      pendingDeveloperRequests,
      approvedDeveloperRequests,
      openDisputes,
      latestAuditEvents,
      apiUsage
    ] = await Promise.all([
      this.prisma.institution.count(),
      this.prisma.institution.count({ where: { status: "ACTIVE" } }),
      this.prisma.institution.count({ where: { status: "SUSPENDED" } }),
      this.prisma.institutionApplication.count({ where: { status: "PENDING" } }),
      this.prisma.learner.count(),
      this.prisma.academicRecord.count({ where: { status: "PUBLISHED" } }),
      this.prisma.credential.count(),
      this.prisma.apiKey.count({ where: { status: "ACTIVE" } }),
      this.prisma.developerAccessRequest.count({ where: { status: "PENDING" } }),
      this.prisma.developerAccessRequest.count({ where: { status: "APPROVED" } }),
      this.prisma.dispute.count({ where: { status: { in: ["OPEN", "ESCALATED"] } } }),
      this.readAuditEvents({ take: 8 }),
      this.readDailyGatewayUsage(7)
    ]);

    const apiCallsToday = apiUsage[apiUsage.length - 1]?.total ?? 0;

    return {
      generatedAt,
      metrics: {
        totalInstitutions,
        pendingApplications,
        activeLearners,
        resultsPublished,
        credentialsIssued,
        apiCallsToday,
        activeApiKeys,
        pendingDeveloperRequests,
        openDisputes
      },
      institutionStatus: {
        total: totalInstitutions,
        active: activeInstitutions,
        suspended: suspendedInstitutions,
        pendingApproval: pendingApplications,
        apiAccessActive: approvedDeveloperRequests
      },
      apiUsage,
      latestAuditEvents
    };
  }

  async readAcademicOperations() {
    const generatedAt = new Date();
    const [
      institutions,
      sessionGroups,
      structureGroups,
      structureTypeGroups,
      enrolmentGroups,
      batchGroups,
      rolloverGroups,
      sealedSessions,
      recentRollovers,
      reopenEvents
    ] = await Promise.all([
      this.prisma.institution.findMany({
        where: { status: { in: ["ACTIVE", "SUSPENDED"] } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          uuid: true,
          institutionId: true,
          officialName: true,
          state: true,
          status: true,
          tier: true
        }
      }),
      this.prisma.academicSession.groupBy({
        by: ["institutionId", "status"],
        _count: { _all: true }
      }),
      this.prisma.academicStructure.groupBy({
        by: ["institutionId"],
        _count: { _all: true }
      }),
      this.prisma.academicStructure.groupBy({
        by: ["type"],
        _count: { _all: true }
      }),
      this.prisma.enrolment.groupBy({
        by: ["institutionId", "status"],
        _count: { _all: true }
      }),
      this.prisma.resultBatch.groupBy({
        by: ["institutionId", "status"],
        _count: { _all: true }
      }),
      this.prisma.rolloverRecord.groupBy({
        by: ["institutionId", "status"],
        _count: { _all: true }
      }),
      this.prisma.academicSession.findMany({
        where: { status: "SEALED" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: {
          institution: {
            select: {
              uuid: true,
              institutionId: true,
              officialName: true,
              state: true
            }
          }
        }
      }),
      this.prisma.rolloverRecord.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: {
          institution: { select: { uuid: true, institutionId: true, officialName: true } },
          learner: { select: { uuid: true, ain: true, fullName: true } },
          fromSession: { select: { uuid: true, sessionLabel: true, periodLabel: true, status: true } },
          toSession: { select: { uuid: true, sessionLabel: true, periodLabel: true, status: true } },
          fromStructure: { select: { uuid: true, type: true, name: true, code: true } },
          toStructure: { select: { uuid: true, type: true, name: true, code: true } }
        }
      }),
      this.readAuditEvents({ action: "academic_session.reopen", targetType: "AcademicSession", take: 12 })
    ]);

    const totalByStatus = <Row extends { status: string; _count: { _all: number } }>(rows: Row[], status: string) =>
      rows.filter((row) => row.status === status).reduce((sum, row) => sum + row._count._all, 0);
    const countForInstitution = <Row extends { institutionId: string; _count: { _all: number } }>(
      rows: Row[],
      institutionId: string,
      status?: string
    ) => rows.filter((row) => row.institutionId === institutionId && (!status || ("status" in row && row.status === status))).reduce((sum, row) => sum + row._count._all, 0);

    const institutionHealth = institutions.map((institution) => {
      const activeSessions = countForInstitution(sessionGroups, institution.uuid, "ACTIVE");
      const sealedSessionCount = countForInstitution(sessionGroups, institution.uuid, "SEALED");
      const structureNodes = countForInstitution(structureGroups, institution.uuid);
      const activeEnrolments = countForInstitution(enrolmentGroups, institution.uuid, "ACTIVE");
      const pendingRollovers = countForInstitution(rolloverGroups, institution.uuid, "PENDING_ROLLOVER");
      const publishedBatches = countForInstitution(batchGroups, institution.uuid, "PUBLISHED");
      const rejectedBatches = countForInstitution(batchGroups, institution.uuid, "REJECTED");
      const completionScore =
        (activeSessions > 0 ? 25 : 0) +
        (structureNodes > 0 ? 25 : 0) +
        (activeEnrolments > 0 ? 25 : 0) +
        (publishedBatches > 0 ? 25 : 0);
      const flags = [
        activeSessions === 0 ? "Missing active session" : null,
        structureNodes === 0 ? "No academic structure" : null,
        activeEnrolments === 0 ? "No active learners" : null,
        sealedSessionCount > 0 ? `${sealedSessionCount} sealed session(s)` : null,
        pendingRollovers > 0 ? `${pendingRollovers} pending rollover(s)` : null,
        rejectedBatches > 0 ? `${rejectedBatches} rejected batch(es)` : null
      ].filter((flag): flag is string => Boolean(flag));

      return {
        institutionUuid: institution.uuid,
        institutionId: institution.institutionId,
        institutionName: institution.officialName,
        state: institution.state,
        status: institution.status,
        tier: institution.tier,
        activeSessions,
        sealedSessions: sealedSessionCount,
        structureNodes,
        activeEnrolments,
        pendingRollovers,
        publishedBatches,
        rejectedBatches,
        completionScore,
        flags
      };
    });

    return {
      generatedAt,
      metrics: {
        activeSessions: totalByStatus(sessionGroups, "ACTIVE"),
        sealedSessions: totalByStatus(sessionGroups, "SEALED"),
        structureNodes: structureGroups.reduce((sum, row) => sum + row._count._all, 0),
        activeEnrolments: totalByStatus(enrolmentGroups, "ACTIVE"),
        pendingRollovers: totalByStatus(rolloverGroups, "PENDING_ROLLOVER"),
        approvedRollovers: totalByStatus(rolloverGroups, "APPROVED"),
        publishedBatches: totalByStatus(batchGroups, "PUBLISHED"),
        rejectedBatches: totalByStatus(batchGroups, "REJECTED"),
        reopenEscalations: reopenEvents.filter((event) => event.action === "academic_session.reopen_requested").length
      },
      sessionStatus: this.countRowsByStatus(sessionGroups),
      batchStatus: this.countRowsByStatus(batchGroups),
      rolloverStatus: this.countRowsByStatus(rolloverGroups),
      structureTypes: structureTypeGroups.map((row) => ({ type: row.type, count: row._count._all })),
      institutionHealth,
      sealedSessions: sealedSessions.map((session) => ({
        id: session.uuid,
        institutionId: session.institution.institutionId,
        institutionName: session.institution.officialName,
        state: session.institution.state,
        sessionLabel: session.sessionLabel,
        periodType: session.periodType,
        periodLabel: session.periodLabel,
        isCurrent: session.isCurrent,
        updatedAt: session.updatedAt
      })),
      recentRollovers: recentRollovers.map((rollover) => ({
        id: rollover.uuid,
        institutionId: rollover.institution.institutionId,
        institutionName: rollover.institution.officialName,
        learnerAin: rollover.learner.ain,
        learnerName: rollover.learner.fullName,
        decision: rollover.decision,
        status: rollover.status,
        fromSession: `${rollover.fromSession.sessionLabel} / ${rollover.fromSession.periodLabel}`,
        toSession: rollover.toSession ? `${rollover.toSession.sessionLabel} / ${rollover.toSession.periodLabel}` : "No target session",
        fromStructure: rollover.fromStructure ? this.describeAcademicStructure(rollover.fromStructure) : "No source structure",
        toStructure: rollover.toStructure ? this.describeAcademicStructure(rollover.toStructure) : "No target structure",
        createdAt: rollover.createdAt
      })),
      sealedSessionEscalations: reopenEvents
    };
  }

  async listAuditEvents(options: { search?: string; targetType?: string; action?: string; outcome?: string } = {}) {
    return this.readAuditEvents({ ...options, take: 250 });
  }

  async readSystemHealth() {
    const generatedAt = new Date();
    const [database, auth, storage, email, notificationDelivery, cache, queue, webhook, signing, rateLimitBuckets, idempotencyRecords, logSink, metrics] = await Promise.all([
      this.checkDatabase(),
      this.checkAuthService(),
      this.checkStorageService(),
      this.checkConfiguredService("Email Service", Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY)),
      this.checkNotificationDelivery(),
      this.checkCacheService(),
      this.checkQueueWorkers(),
      this.checkWebhookDelivery(),
      this.checkCredentialSigning(),
      this.checkRateLimitBuckets(),
      this.checkIdempotencyRecords(),
      this.checkLogSink(),
      this.readGatewayMetrics()
    ]);

    const services = [
      {
        name: "API Gateway",
        status: "OPERATIONAL" as HealthStatus,
        responseTimeMs: 0,
        message: "NestJS gateway process is running."
      },
      database,
      auth,
      storage,
      email,
      notificationDelivery,
      cache,
      queue,
      webhook,
      signing,
      rateLimitBuckets,
      idempotencyRecords,
      logSink
    ];
    const incidents = this.deriveIncidents(services, metrics);
    const overallStatus = services.some((service) => service.status === "DOWN")
      ? "DOWN"
      : services.some((service) => service.status === "DEGRADED")
        ? "DEGRADED"
        : "OPERATIONAL";

    return {
      overallStatus,
      generatedAt,
      uptimeSeconds: Math.floor(process.uptime()),
      services,
      metrics,
      incidents
    };
  }

  async readRateLimitBuckets() {
    return this.rateLimitManager().readBucketSummary({ recentHours: 24, staleAfterHours: 24 });
  }

  async readRateLimitPolicy() {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: "rateLimits" },
      select: {
        value: true,
        updatedAt: true,
        updatedBy: {
          select: {
            fullName: true,
            email: true
          }
        }
      }
    });

    return {
      policy: this.mergeSettingValue(defaultPlatformSettings.rateLimits, row?.value),
      metadata: {
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
        persisted: Boolean(row)
      }
    };
  }

  async updateRateLimitPolicy(auth: AuthTokenPayload, input: unknown) {
    const policy = this.parseRateLimitPolicyInput(input);
    await this.prisma.platformSetting.upsert({
      where: { key: "rateLimits" },
      update: {
        value: policy as Prisma.InputJsonValue,
        updatedById: auth.sub
      },
      create: {
        key: "rateLimits",
        value: policy as Prisma.InputJsonValue,
        updatedById: auth.sub
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorUserId: auth.sub,
      actorRole: auth.role,
      action: "rate_limit_policy.update",
      targetType: "PlatformSettings",
      targetId: "rateLimits",
      outcome: "SUCCESS",
      metadata: {
        emergencyEnabled: policy.emergency.enabled,
        productDefaults: Object.keys(policy.productDefaultsPerMinute).length,
        institutionOverrides: Object.keys(policy.institutionOverridesPerMinute).length,
        scopeOverrides: Object.keys(policy.scopeOverrides).length
      }
    });

    this.cache?.invalidateTag("platform-settings");
    this.rateLimit?.clearPolicyCache();
    return this.readRateLimitPolicy();
  }

  async readIdempotencyRecords() {
    return this.idempotencyManager().readSummary({ recentHours: 24, staleAfterHours: 2, take: 50 });
  }

  async listDeadLetters() {
    const jobs = await this.prisma.backgroundJob.findMany({
      where: { status: BackgroundJobStatus.FAILED },
      include: this.deadLetterJobInclude(),
      orderBy: [{ failedAt: "desc" }, { updatedAt: "desc" }],
      take: 100
    });
    const webhookDeliveries = await this.prisma.webhookDelivery.findMany({
      where: { status: "FAILED" },
      include: this.webhookDeliveryInclude(),
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    const failedNotifications = await this.prisma.notification.findMany({
      where: { status: "FAILED" },
      include: this.notificationInclude(),
      orderBy: { updatedAt: "desc" },
      take: 50
    });
    const failedJobsTotal = await this.prisma.backgroundJob.count({ where: { status: BackgroundJobStatus.FAILED } });
    const failedWebhookDeliveriesTotal = await this.prisma.webhookDelivery.count({ where: { status: "FAILED" } });
    const failedNotificationsTotal = await this.prisma.notification.count({ where: { status: "FAILED" } });

    return {
      generatedAt: new Date(),
      summary: {
        failedJobs: failedJobsTotal,
        failedWebhookDeliveries: failedWebhookDeliveriesTotal,
        failedNotifications: failedNotificationsTotal,
        oldestFailedAt: jobs.reduce<Date | null>((oldest, job) => {
          const failedAt = job.failedAt ?? job.updatedAt;
          return !oldest || failedAt < oldest ? failedAt : oldest;
        }, null)
      },
      jobs: jobs.map((job) => this.safeDeadLetterJob(job)),
      webhookDeliveries: webhookDeliveries.map((delivery) => this.safeWebhookDelivery(delivery)),
      notifications: failedNotifications.map((notification) => this.safeNotification(notification))
    };
  }

  async retryDeadLetterJob(auth: AuthTokenPayload, id: string) {
    const existing = await this.prisma.backgroundJob.findUnique({
      where: { uuid: id },
      include: this.deadLetterJobInclude()
    });
    if (!existing) {
      throw new BadRequestException("Dead-letter job not found.");
    }
    if (existing.status !== BackgroundJobStatus.FAILED) {
      throw new BadRequestException("Only failed dead-letter jobs can be retried.");
    }

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const nextMaxAttempts = Math.max(existing.maxAttempts, existing.attempts + 1, this.retryPolicy.maxAttemptsFor(existing.type));
      const job = await tx.backgroundJob.update({
        where: { uuid: existing.uuid },
        data: {
          status: BackgroundJobStatus.RETRYING,
          error: null,
          progress: 0,
          lockedAt: null,
          lockedBy: null,
          runAfter: new Date(),
          failedAt: null,
          maxAttempts: nextMaxAttempts
        },
        include: this.deadLetterJobInclude()
      });

      if (existing.type === BackgroundJobType.WEBHOOK_DELIVERY) {
        await tx.webhookDelivery.updateMany({
          where: { jobId: existing.uuid, status: "FAILED" },
          data: {
            status: "RETRYING",
            nextAttemptAt: new Date(),
            lastError: null
          }
        });
      }

      await tx.domainEvent.create({
        data: {
          type: "background_job.dead_letter_retry_queued",
          aggregateType: "BackgroundJob",
          aggregateId: existing.uuid,
          institutionId: existing.institutionId,
          jobId: existing.uuid,
          payload: {
            jobId: existing.uuid,
            type: existing.type,
            queue: existing.queue,
            previousAttempts: existing.attempts,
            maxAttempts: nextMaxAttempts
          }
        }
      });

      return job;
    });

    await this.audit.write({
      actorId: auth.sub,
      actorUserId: auth.sub,
      actorRole: auth.role,
      action: "background_job.dead_letter_retry_queued",
      targetType: "BackgroundJob",
      targetId: existing.uuid,
      institutionId: existing.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        type: existing.type,
        queue: existing.queue,
        attempts: existing.attempts
      }
    });

    return {
      accepted: true,
      job: this.safeDeadLetterJob(result)
    };
  }

  async queueRateLimitBucketCleanup(auth: AuthTokenPayload, input: unknown) {
    if (!this.queue) {
      throw new BadRequestException("Queue service is unavailable.");
    }

    const body = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
    const olderThanHours = this.parseBoundedNumber(body.olderThanHours, 1, 720, 24);
    const job = await this.queue.enqueueJob({
      type: BackgroundJobType.RATE_LIMIT_BUCKET_CLEANUP,
      createdById: auth.sub,
      relatedEntityType: "RateLimitBucket",
      priority: -5,
      maxAttempts: 2,
      payload: {
        olderThanHours
      },
      eventType: "rate_limit_bucket.cleanup_queued"
    });

    await this.audit.write({
      actorUserId: auth.sub,
      actorRole: auth.role,
      action: "rate_limit_bucket.cleanup_queued",
      targetType: "RateLimitBucket",
      outcome: "SUCCESS",
      metadata: {
        jobId: job.jobId,
        olderThanHours
      }
    });

    return {
      ...job,
      olderThanHours
    };
  }

  async queueIdempotencyRecordCleanup(auth: AuthTokenPayload, input: unknown) {
    if (!this.queue) {
      throw new BadRequestException("Queue service is unavailable.");
    }

    const body = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
    const olderThanHours = this.parseBoundedNumber(body.olderThanHours, 1, 2160, 24);
    const job = await this.queue.enqueueJob({
      type: BackgroundJobType.IDEMPOTENCY_RECORD_CLEANUP,
      createdById: auth.sub,
      relatedEntityType: "IdempotencyRecord",
      priority: -5,
      maxAttempts: 2,
      payload: {
        olderThanHours
      },
      eventType: "idempotency_record.cleanup_queued"
    });

    await this.audit.write({
      actorUserId: auth.sub,
      actorRole: auth.role,
      action: "idempotency_record.cleanup_queued",
      targetType: "IdempotencyRecord",
      outcome: "SUCCESS",
      metadata: {
        jobId: job.jobId,
        olderThanHours
      }
    });

    return {
      ...job,
      olderThanHours
    };
  }

  async listNotifications(options: { status?: string; channel?: string } = {}) {
    const status = this.optionalEnum(options.status, ["PENDING", "SENT", "FAILED", "CANCELLED"]);
    const channel = this.optionalEnum(options.channel, ["PUSH", "EMAIL", "SMS", "WEBHOOK"]);
    const notifications = await this.prisma.notification.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(channel ? { channel } : {})
      },
      include: this.notificationInclude(),
      orderBy: { updatedAt: "desc" },
      take: 250
    });

    return notifications.map((notification) => this.safeNotification(notification));
  }

  async retryNotification(auth: AuthTokenPayload, id: string) {
    const existing = await this.prisma.notification.findUnique({
      where: { uuid: id },
      include: this.notificationInclude()
    });
    if (!existing) {
      throw new BadRequestException("Notification not found.");
    }
    if (existing.status !== "FAILED") {
      throw new BadRequestException("Only failed notifications can be retried.");
    }
    if (existing.channel === "WEBHOOK") {
      throw new BadRequestException("Webhook notifications must be retried from webhook delivery controls.");
    }

    const jobType = existing.channel === "PUSH" ? BackgroundJobType.PUSH_NOTIFICATION : BackgroundJobType.SMS_EMAIL_DELIVERY;
    const queue = existing.channel === "PUSH" ? "notifications.push" : "notifications.delivery";
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const job = await tx.backgroundJob.create({
        data: {
          type: jobType,
          queue,
          institutionId: existing.institutionId,
          relatedEntityType: "Notification",
          relatedEntityId: existing.uuid,
          createdById: auth.sub,
          priority: 1,
          maxAttempts: this.retryPolicy.maxAttemptsFor(jobType),
          payload: {
            notificationId: existing.uuid,
            channel: existing.channel,
            retry: true
          }
        }
      });

      await tx.notification.update({
        where: { uuid: existing.uuid },
        data: {
          jobId: job.uuid,
          status: "PENDING",
          failedAt: null,
          error: null
        }
      });

      await tx.domainEvent.create({
        data: {
          type: "notification.retry_queued",
          aggregateType: "Notification",
          aggregateId: existing.uuid,
          institutionId: existing.institutionId,
          jobId: job.uuid,
          payload: {
            notificationId: existing.uuid,
            channel: existing.channel,
            jobId: job.uuid
          }
        }
      });

      return job;
    });

    await this.audit.write({
      actorUserId: auth.sub,
      actorRole: auth.role,
      action: "notification.retry_queued",
      targetType: "Notification",
      targetId: existing.uuid,
      institutionId: existing.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        jobId: result.uuid,
        channel: existing.channel
      }
    });

    return {
      id: result.uuid,
      jobId: result.uuid,
      type: result.type,
      queue: result.queue,
      status: result.status,
      notificationId: existing.uuid,
      pollingUrl: `/jobs/${result.uuid}`
    };
  }

  async readRevenueOverview() {
    const generatedAt = new Date();
    const monthStart = new Date(generatedAt.getFullYear(), generatedAt.getMonth(), 1);
    const chartStart = this.daysAgo(30);
    const [categoryTotals, statusTotals, recentEntries, subscriptions, dailyRows] = await Promise.all([
      this.prisma.revenueLedgerEntry.groupBy({
        by: ["category"],
        where: { status: { in: billableRevenueStatuses } },
        _sum: { amountMinor: true },
        _count: { _all: true }
      }),
      this.prisma.revenueLedgerEntry.groupBy({
        by: ["status"],
        where: { occurredAt: { gte: monthStart } },
        _sum: { amountMinor: true },
        _count: { _all: true }
      }),
      this.prisma.revenueLedgerEntry.findMany({
        orderBy: { occurredAt: "desc" },
        take: 50,
        include: {
          institution: {
            select: {
              institutionId: true,
              officialName: true
            }
          }
        }
      }),
      this.prisma.institutionSubscription.findMany({
        orderBy: [{ status: "asc" }, { nextBillingAt: "asc" }],
        take: 50,
        include: {
          institution: {
            select: {
              institutionId: true,
              officialName: true
            }
          }
        }
      }),
      this.readDailyRevenue(chartStart)
    ]);

    const categoryBreakdown = revenueCategories.map((category) => {
      const total = categoryTotals.find((entry) => entry.category === category);
      return {
        category,
        amountMinor: total?._sum.amountMinor ?? 0,
        count: total?._count._all ?? 0
      };
    });
    const statusBreakdown = statusTotals.map((entry) => ({
      status: entry.status,
      amountMinor: entry._sum.amountMinor ?? 0,
      count: entry._count._all
    }));
    const totalAmountMinor = categoryBreakdown.reduce((sum, entry) => sum + entry.amountMinor, 0);
    const paidThisMonthMinor = this.sumRevenueStatuses(statusBreakdown, ["PAID"]);
    const pendingThisMonthMinor = this.sumRevenueStatuses(statusBreakdown, ["PENDING", "BILLABLE", "INVOICED"]);

    return {
      generatedAt,
      currency: "NGN",
      totals: {
        totalAmountMinor,
        paidThisMonthMinor,
        pendingThisMonthMinor,
        activeSubscriptions: subscriptions.filter((subscription) => subscription.status === "ACTIVE" || subscription.status === "TRIALING").length,
        openLedgerEntries: statusBreakdown.filter((entry) => ["PENDING", "BILLABLE", "INVOICED"].includes(entry.status)).reduce((sum, entry) => sum + entry.count, 0)
      },
      categoryBreakdown,
      statusBreakdown,
      daily: this.normaliseDailyRevenue(chartStart, dailyRows),
      recentEntries: recentEntries.map((entry) => ({
        id: entry.uuid,
        category: entry.category,
        status: entry.status,
        amountMinor: entry.amountMinor,
        currency: entry.currency,
        institutionId: entry.institution?.institutionId ?? null,
        institutionName: entry.institution?.officialName ?? null,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        description: entry.description,
        occurredAt: entry.occurredAt
      })),
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.uuid,
        institutionId: subscription.institution.institutionId,
        institutionName: subscription.institution.officialName,
        planCode: subscription.planCode,
        status: subscription.status,
        amountMinor: subscription.amountMinor,
        currency: subscription.currency,
        billingInterval: subscription.billingInterval,
        currentPeriodEnd: subscription.currentPeriodEnd,
        nextBillingAt: subscription.nextBillingAt
      }))
    };
  }

  async readPlatformSettings() {
    return (
      this.cache?.getOrSet("platform-settings:current", () => this.readPlatformSettingsFromDatabase(), {
        ttlSeconds: 60,
        tags: ["platform-settings"]
      }) ?? this.readPlatformSettingsFromDatabase()
    );
  }

  private async readPlatformSettingsFromDatabase() {
    const rows = await this.prisma.platformSetting.findMany({
      select: {
        key: true,
        value: true,
        updatedAt: true,
        updatedBy: {
          select: {
            fullName: true,
            email: true
          }
        }
      }
    });
    const rowByKey = new Map(rows.map((row) => [row.key, row]));
    const settings = {
      approval: this.mergeSettingValue(defaultPlatformSettings.approval, rowByKey.get("approval")?.value),
      api: this.mergeSettingValue(defaultPlatformSettings.api, rowByKey.get("api")?.value),
      rateLimits: this.mergeSettingValue(defaultPlatformSettings.rateLimits, rowByKey.get("rateLimits")?.value),
      notifications: this.mergeSettingValue(defaultPlatformSettings.notifications, rowByKey.get("notifications")?.value),
      emailTemplates: this.mergeSettingValue(defaultPlatformSettings.emailTemplates, rowByKey.get("emailTemplates")?.value)
    };

    return {
      settings,
      metadata: {
        updatedAt: rows.reduce<Date | null>((latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest), null),
        updatedBy: rows.find((row) => row.updatedBy)?.updatedBy ?? null,
        persistedKeys: rows.map((row) => row.key).sort()
      }
    };
  }

  async updatePlatformSettings(auth: AuthTokenPayload, input: unknown) {
    const parsed = platformSettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.prisma.$transaction(
      Object.entries(parsed.data).map(([key, value]) =>
        this.prisma.platformSetting.upsert({
          where: { key },
          update: {
            value: value as Prisma.InputJsonValue,
            updatedById: auth.sub
          },
          create: {
            key,
            value: value as Prisma.InputJsonValue,
            updatedById: auth.sub
          }
        })
      )
    );

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "platform_settings.update",
      targetType: "PlatformSettings",
      outcome: "SUCCESS",
      metadata: {
        keys: Object.keys(parsed.data)
      }
    });

    this.cache?.invalidateTag("platform-settings");
    if (parsed.data.rateLimits) {
      this.rateLimit?.clearPolicyCache();
    }
    return this.readPlatformSettings();
  }

  async createWebhookEndpoint(auth: AuthTokenPayload, institutionId: string, input: unknown) {
    const parsed = this.parseWebhookEndpointInput(input);
    const institution = await this.prisma.institution.findUnique({
      where: { uuid: institutionId },
      select: { uuid: true, institutionId: true, officialName: true }
    });
    if (!institution) {
      throw new BadRequestException("Institution not found.");
    }

    const secret = this.webhookSecretManager().createSecret();
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        institutionId: institution.uuid,
        label: parsed.label,
        targetUrl: parsed.targetUrl,
        eventTypes: parsed.eventTypes,
        secretEncrypted: this.webhookSecretManager().encrypt(secret),
        secretPreview: this.webhookSecretManager().preview(secret),
        createdById: auth.sub
      },
      include: this.webhookEndpointInclude()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "webhook_endpoint.create",
      targetType: "WebhookEndpoint",
      targetId: endpoint.uuid,
      institutionId: institution.uuid,
      outcome: "SUCCESS",
      metadata: {
        label: endpoint.label,
        targetUrl: endpoint.targetUrl,
        eventTypes: endpoint.eventTypes
      }
    });

    return {
      endpoint: this.safeWebhookEndpoint(endpoint),
      secret,
      warning: "Webhook secret is shown once. Store it in the partner system before leaving this screen."
    };
  }

  async listWebhookEndpoints(options: { institutionId?: string; status?: string } = {}) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        ...(options.institutionId ? { institutionId: options.institutionId } : {}),
        ...(options.status ? { status: options.status as never } : {})
      },
      include: this.webhookEndpointInclude(),
      orderBy: { createdAt: "desc" },
      take: 250
    });
    return endpoints.map((endpoint) => this.safeWebhookEndpoint(endpoint));
  }

  async rotateWebhookEndpointSecret(auth: AuthTokenPayload, id: string) {
    const existing = await this.prisma.webhookEndpoint.findUnique({
      where: { uuid: id },
      include: this.webhookEndpointInclude()
    });
    if (!existing) {
      throw new BadRequestException("Webhook endpoint not found.");
    }

    const secret = this.webhookSecretManager().createSecret();
    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { uuid: id },
      data: {
        secretEncrypted: this.webhookSecretManager().encrypt(secret),
        secretPreview: this.webhookSecretManager().preview(secret),
        rotatedAt: new Date()
      },
      include: this.webhookEndpointInclude()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "webhook_endpoint.rotate_secret",
      targetType: "WebhookEndpoint",
      targetId: endpoint.uuid,
      institutionId: endpoint.institutionId,
      outcome: "SUCCESS"
    });

    return {
      endpoint: this.safeWebhookEndpoint(endpoint),
      secret,
      warning: "Webhook secret is shown once. Update the partner system immediately."
    };
  }

  async updateWebhookEndpointStatus(auth: AuthTokenPayload, id: string, status: "ACTIVE" | "SUSPENDED" | "DISABLED") {
    if (!["ACTIVE", "SUSPENDED", "DISABLED"].includes(status)) {
      throw new BadRequestException("Webhook endpoint status must be ACTIVE, SUSPENDED, or DISABLED.");
    }

    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { uuid: id },
      data: {
        status,
        disabledAt: status === "DISABLED" ? new Date() : null
      },
      include: this.webhookEndpointInclude()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "webhook_endpoint.status_update",
      targetType: "WebhookEndpoint",
      targetId: endpoint.uuid,
      institutionId: endpoint.institutionId,
      outcome: "SUCCESS",
      metadata: { status }
    });

    return this.safeWebhookEndpoint(endpoint);
  }

  async listWebhookDeliveries(options: { institutionId?: string; status?: string } = {}) {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: {
        ...(options.institutionId ? { institutionId: options.institutionId } : {}),
        ...(options.status ? { status: options.status as never } : {})
      },
      include: this.webhookDeliveryInclude(),
      orderBy: { createdAt: "desc" },
      take: 250
    });
    return deliveries.map((delivery) => this.safeWebhookDelivery(delivery));
  }

  async retryWebhookDelivery(auth: AuthTokenPayload, id: string) {
    const existing = await this.prisma.webhookDelivery.findUnique({
      where: { uuid: id },
      include: this.webhookDeliveryInclude()
    });
    if (!existing) {
      throw new BadRequestException("Webhook delivery not found.");
    }
    if (existing.status === "DELIVERED") {
      throw new BadRequestException("Delivered webhooks should be replayed, not retried.");
    }

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const job = await this.createWebhookJob(tx, existing, "webhook_delivery.retry_requested");
      const delivery = await tx.webhookDelivery.update({
        where: { uuid: existing.uuid },
        data: {
          jobId: job.uuid,
          status: "RETRYING",
          nextAttemptAt: new Date(),
          lastStatusCode: null,
          lastError: null
        },
        include: this.webhookDeliveryInclude()
      });
      return { job, delivery };
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "webhook_delivery.retry",
      targetType: "WebhookDelivery",
      targetId: existing.uuid,
      institutionId: existing.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        jobId: result.job.uuid,
        eventType: existing.eventType
      }
    });

    return {
      accepted: true,
      delivery: this.safeWebhookDelivery(result.delivery),
      job: this.webhookJobResponse(result.job),
      idempotencyKey: `whd_${result.delivery.uuid}`
    };
  }

  async replayWebhookDelivery(auth: AuthTokenPayload, id: string) {
    const existing = await this.prisma.webhookDelivery.findUnique({
      where: { uuid: id },
      include: this.webhookDeliveryInclude()
    });
    if (!existing) {
      throw new BadRequestException("Webhook delivery not found.");
    }

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const job = await tx.backgroundJob.create({
        data: {
          type: BackgroundJobType.WEBHOOK_DELIVERY,
          queue: "webhooks.delivery",
          institutionId: existing.institutionId,
          relatedEntityType: "WebhookDelivery",
          priority: 1,
          maxAttempts: this.retryPolicy.maxAttemptsFor(BackgroundJobType.WEBHOOK_DELIVERY),
          payload: {
            replayOfDeliveryId: existing.uuid,
            webhookEndpointId: existing.webhookEndpointId,
            targetUrl: existing.targetUrl,
            eventType: existing.eventType
          }
        }
      });
      const event = await tx.domainEvent.create({
        data: {
          type: "webhook_delivery.replay_requested",
          aggregateType: "WebhookDelivery",
          aggregateId: existing.uuid,
          institutionId: existing.institutionId,
          jobId: job.uuid,
          payload: {
            replayOfDeliveryId: existing.uuid,
            jobId: job.uuid,
            webhookEndpointId: existing.webhookEndpointId,
            eventType: existing.eventType
          }
        }
      });
      const delivery = await tx.webhookDelivery.create({
        data: {
          jobId: job.uuid,
          eventId: event.uuid,
          institutionId: existing.institutionId,
          webhookEndpointId: existing.webhookEndpointId,
          targetUrl: existing.targetUrl,
          eventType: existing.eventType,
          payload: existing.payload as Prisma.InputJsonValue
        },
        include: this.webhookDeliveryInclude()
      });
      const updatedJob = await tx.backgroundJob.update({
        where: { uuid: job.uuid },
        data: {
          relatedEntityId: delivery.uuid,
          payload: {
            replayOfDeliveryId: existing.uuid,
            deliveryId: delivery.uuid,
            webhookEndpointId: existing.webhookEndpointId,
            targetUrl: existing.targetUrl,
            eventType: existing.eventType
          }
        }
      });
      return { job: updatedJob, delivery };
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "webhook_delivery.replay",
      targetType: "WebhookDelivery",
      targetId: result.delivery.uuid,
      institutionId: existing.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        replayOfDeliveryId: existing.uuid,
        jobId: result.job.uuid,
        eventType: existing.eventType
      }
    });

    return {
      accepted: true,
      delivery: this.safeWebhookDelivery(result.delivery),
      job: this.webhookJobResponse(result.job),
      idempotencyKey: `whd_${result.delivery.uuid}`
    };
  }

  async createApiKey(auth: AuthTokenPayload, institutionId: string, input: unknown) {
    const parsed = this.parseApiKeyInput(input);
    const institution = await this.prisma.institution.findUnique({
      where: { uuid: institutionId },
      select: { uuid: true, institutionId: true, officialName: true }
    });
    if (!institution) {
      throw new BadRequestException("Institution not found.");
    }

    const approvedDeveloperAccess = await this.prisma.developerAccessRequest.findFirst({
      where: {
        institutionId: institution.uuid,
        status: "APPROVED"
      },
      select: { uuid: true }
    });
    if (!approvedDeveloperAccess) {
      throw new BadRequestException("Institution needs approved developer access before Live Results API keys can be created.");
    }

    const clientId = this.createClientId(parsed.environment);
    const clientSecret = this.createClientSecret(parsed.environment);
    const apiKey = await this.prisma.apiKey.create({
      data: {
        ownerType: "INSTITUTION",
        institutionId: institution.uuid,
        clientId,
        clientSecretHash: this.passwordService.hash(clientSecret),
        label: parsed.label,
        scopes: parsed.scopes,
        environment: parsed.environment,
        rateLimitPerMinute: parsed.rateLimitPerMinute,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
        createdById: auth.sub
      },
      select: this.safeApiKeySelect()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "api_key.create",
      targetType: "ApiKey",
      targetId: apiKey.uuid,
      institutionId: institution.uuid,
      outcome: "SUCCESS",
      metadata: {
        clientId,
        label: parsed.label,
        scopes: parsed.scopes,
        environment: parsed.environment,
        rateLimitPerMinute: parsed.rateLimitPerMinute
      }
    });

    return {
      ...apiKey,
      clientSecret,
      warning: "This client_secret is shown once. Store it securely; it cannot be retrieved later."
    };
  }

  async createProductApiKey(auth: AuthTokenPayload, input: unknown) {
    const parsed = this.parseProductApiKeyInput(input);
    const clientId = this.createClientId(parsed.environment);
    const clientSecret = this.createClientSecret(parsed.environment);
    const apiKey = await this.prisma.apiKey.create({
      data: {
        ownerType: "PRODUCT",
        productCode: parsed.productCode,
        productName: parsed.productName,
        clientId,
        clientSecretHash: this.passwordService.hash(clientSecret),
        label: parsed.label,
        scopes: parsed.scopes,
        environment: parsed.environment,
        rateLimitPerMinute: parsed.rateLimitPerMinute,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
        createdById: auth.sub
      },
      select: this.safeApiKeySelect()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "api_key.product.create",
      targetType: "ApiKey",
      targetId: apiKey.uuid,
      outcome: "SUCCESS",
      metadata: {
        clientId,
        productCode: parsed.productCode,
        productName: parsed.productName,
        label: parsed.label,
        scopes: parsed.scopes,
        environment: parsed.environment,
        rateLimitPerMinute: parsed.rateLimitPerMinute
      }
    });

    return {
      ...apiKey,
      clientSecret,
      warning: "This product client_secret is shown once. Store it in the product backend only; never place it in browser code."
    };
  }

  async listApiKeys(institutionId: string) {
    return this.prisma.apiKey.findMany({
      where: { institutionId },
      select: this.safeApiKeySelect(),
      orderBy: { createdAt: "desc" }
    });
  }

  async listGlobalApiKeys() {
    const keys = await this.prisma.apiKey.findMany({
      select: {
        ...this.safeApiKeySelect(),
        institution: {
          select: {
            uuid: true,
            institutionId: true,
            officialName: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return keys.map((key) => ({
      ...key,
      institutionUuid: key.institution?.uuid ?? null,
      institutionDisplayId: key.institution?.institutionId ?? null,
      institutionName: key.institution?.officialName ?? null,
      institutionStatus: key.institution?.status ?? null,
      ownerLabel: key.ownerType === "PRODUCT" ? key.productName : key.institution?.officialName,
      ownerReference: key.ownerType === "PRODUCT" ? key.productCode : key.institution?.institutionId
    }));
  }

  async revokeApiKey(auth: AuthTokenPayload, id: string, reason?: string) {
    const apiKey = await this.prisma.apiKey.update({
      where: { uuid: id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedReason: reason ?? "Revoked by founder."
      },
      select: this.safeApiKeySelect()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "api_key.revoke",
      targetType: "ApiKey",
      targetId: apiKey.uuid,
      institutionId: apiKey.institutionId ?? undefined,
      outcome: "SUCCESS",
      reason
    });

    return apiKey;
  }

  async regenerateApiKey(auth: AuthTokenPayload, id: string) {
    const existing = await this.prisma.apiKey.findUnique({
      where: { uuid: id },
      select: {
        uuid: true,
        institutionId: true,
        ownerType: true,
        environment: true,
        productCode: true,
        productName: true,
        label: true
      }
    });
    if (!existing) {
      throw new BadRequestException("API key not found.");
    }

    const clientId = this.createClientId(existing.environment);
    const clientSecret = this.createClientSecret(existing.environment);
    const apiKey = await this.prisma.apiKey.update({
      where: { uuid: id },
      data: {
        clientId,
        clientSecretHash: this.passwordService.hash(clientSecret),
        status: "ACTIVE",
        revokedAt: null,
        revokedReason: null
      },
      select: this.safeApiKeySelect()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: existing.ownerType === "PRODUCT" ? "api_key.product.regenerate" : "api_key.regenerate",
      targetType: "ApiKey",
      targetId: apiKey.uuid,
      institutionId: apiKey.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        clientId,
        ownerType: existing.ownerType,
        productCode: existing.productCode,
        productName: existing.productName,
        label: existing.label,
        environment: existing.environment
      }
    });

    return {
      ...apiKey,
      clientSecret,
      warning: "This regenerated client_secret is shown once. Replace the old secret in the backend and store it securely."
    };
  }

  async emergencyLockdown(auth: AuthTokenPayload, reason?: string) {
    const finalReason = reason?.trim() || "Emergency lockdown triggered from Founder Console.";
    const now = new Date();
    const revoked = await this.prisma.apiKey.updateMany({
      where: { status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokedReason: finalReason
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "founder.emergency_lockdown",
      targetType: "Platform",
      targetId: "api-gateway",
      outcome: "SUCCESS",
      reason: finalReason,
      metadata: {
        revokedApiKeys: revoked.count
      }
    });

    return {
      accepted: true,
      revokedApiKeys: revoked.count,
      reason: finalReason,
      executedAt: now
    };
  }

  private async reviewDeveloperAccessRequest(
    auth: AuthTokenPayload,
    id: string,
    status: "APPROVED" | "REJECTED" | "SUSPENDED",
    feedback?: string
  ) {
    const parsed = reviewDeveloperAccessRequestSchema.safeParse({ feedback });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existing = await this.prisma.developerAccessRequest.findUnique({
      where: { uuid: id },
      include: {
        institution: {
          select: {
            uuid: true,
            institutionId: true,
            officialName: true
          }
        }
      }
    });
    if (!existing) {
      throw new BadRequestException("Developer access request not found.");
    }

    if ((status === "APPROVED" || status === "REJECTED") && existing.status !== "PENDING") {
      throw new BadRequestException("Only pending developer access requests can be approved or rejected.");
    }
    if (status === "SUSPENDED" && existing.status !== "APPROVED") {
      throw new BadRequestException("Only approved developer access requests can be suspended.");
    }

    const reviewedAt = new Date();
    const request = await this.prisma.developerAccessRequest.update({
      where: { uuid: id },
      data: {
        status,
        reviewedById: auth.sub,
        reviewedAt,
        reviewFeedback: parsed.data.feedback?.trim() || null,
        approvedAt: status === "APPROVED" ? reviewedAt : existing.approvedAt,
        suspendedAt: status === "SUSPENDED" ? reviewedAt : null
      },
      include: {
        institution: {
          select: {
            uuid: true,
            institutionId: true,
            officialName: true,
            type: true,
            state: true,
            status: true
          }
        }
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: `developer_access_request.${status.toLowerCase()}`,
      targetType: "DeveloperAccessRequest",
      targetId: id,
      institutionId: existing.institutionId,
      outcome: "SUCCESS",
      reason: parsed.data.feedback,
      metadata: {
        institutionId: existing.institution.institutionId,
        previousStatus: existing.status,
        nextStatus: status
      }
    });

    return request;
  }

  private async nextInstitutionDisplayId(prisma: Pick<PrismaService, "institution"> = this.prisma): Promise<string> {
    const count = await prisma.institution.count();
    return `AINi-${(count + 1).toString().padStart(5, "0")}`;
  }

  private async assertInstitutionExists(institutionId: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { uuid: institutionId },
      select: { uuid: true }
    });
    if (!institution) {
      throw new BadRequestException("Institution not found.");
    }
  }

  private parseInstitutionUserRole(role: string) {
    const normalized = role.trim().toUpperCase();
    const allowed = new Set<UserRole>([
      UserRole.REGISTRAR,
      UserRole.EXAM_OFFICER,
      UserRole.DATA_ENTRY_OFFICER,
      UserRole.DEPARTMENTAL_OFFICER,
      UserRole.READ_ONLY
    ]);
    if (!allowed.has(normalized as UserRole)) {
      throw new BadRequestException("Staff role is invalid.");
    }
    return normalized as UserRole;
  }

  private parseInstitutionUserStatus(status: string) {
    const normalized = status.trim().toUpperCase();
    const allowed = new Set<InstitutionUserStatus>([
      InstitutionUserStatus.INVITED,
      InstitutionUserStatus.ACTIVE,
      InstitutionUserStatus.SUSPENDED,
      InstitutionUserStatus.DISABLED
    ]);
    if (!allowed.has(normalized as InstitutionUserStatus)) {
      throw new BadRequestException("Staff status is invalid.");
    }
    return normalized as InstitutionUserStatus;
  }

  private parseStringArray(value: unknown, field: string, maxItems: number, required: true): string[];
  private parseStringArray(value: unknown, field: string, maxItems: number, required: false): string[] | undefined;
  private parseStringArray(value: unknown, field: string, maxItems: number, required: boolean) {
    if (!Array.isArray(value)) {
      if (required) {
        throw new BadRequestException(`${field} must be an array.`);
      }
      return undefined;
    }
    const items = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length !== value.length || items.length > maxItems) {
      throw new BadRequestException(`${field} must contain ${maxItems} or fewer string values.`);
    }
    return Array.from(new Set(items));
  }

  private parseAssignedScopes(value: unknown) {
    if (value === undefined) {
      return undefined;
    }
    if (!Array.isArray(value)) {
      throw new BadRequestException("assignedScopes must be an array.");
    }
    if (value.length > 25) {
      throw new BadRequestException("assignedScopes cannot contain more than 25 entries.");
    }
    return value.map((scope) => {
      if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
        throw new BadRequestException("Each assigned scope must be an object.");
      }
      const entries = Object.entries(scope as Record<string, unknown>)
        .filter(([, scopeValue]) => scopeValue !== undefined && scopeValue !== null && String(scopeValue).trim() !== "")
        .map(([key, scopeValue]) => [key.trim(), String(scopeValue).trim()]);
      if (!entries.length || entries.length > 8 || entries.some(([key]) => !/^[a-zA-Z0-9_.-]{1,64}$/.test(key))) {
        throw new BadRequestException("Assigned scope entries are invalid.");
      }
      return Object.fromEntries(entries);
    });
  }

  private safeInstitutionStaff(member: Prisma.InstitutionUserGetPayload<{
    include: {
      user: { select: { uuid: true; email: true; fullName: true; phone: true; mfaEnabled: true } };
      invitedBy: { select: { uuid: true; email: true; fullName: true } };
      institution: { select: { uuid: true; institutionId: true; officialName: true } };
    };
  }>) {
    return {
      uuid: member.uuid,
      role: member.role,
      status: member.status,
      permissions: member.permissions,
      assignedScopes: Array.isArray(member.assignedScopes) ? member.assignedScopes : [],
      twoFactorRequired: member.twoFactorRequired,
      invitedAt: member.invitedAt,
      inviteExpiresAt: member.inviteExpiresAt,
      inviteAcceptedAt: member.inviteAcceptedAt,
      lastLoginAt: member.lastLoginAt,
      suspendedAt: member.suspendedAt,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      user: member.user,
      invitedBy: member.invitedBy,
      institution: member.institution
    };
  }

  private parseApiKeyInput(input: unknown): {
    label: string;
    scopes: string[];
    environment: ApiKeyEnvironment;
    rateLimitPerMinute: number;
    expiresAt?: string;
  } {
    const body = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (label.length < 2) {
      throw new BadRequestException("API key label is required.");
    }

    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === "string") : [];
    if (!scopes.length || scopes.some((scope) => !allowedApiKeyScopes.has(scope))) {
      throw new BadRequestException("API key scopes are invalid.");
    }

    const environment: ApiKeyEnvironment = body.environment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
    const rateLimitPerMinute =
      typeof body.rateLimitPerMinute === "number" && Number.isInteger(body.rateLimitPerMinute)
        ? body.rateLimitPerMinute
        : 100;
    if (rateLimitPerMinute < 1 || rateLimitPerMinute > 10000) {
      throw new BadRequestException("API key rate limit must be between 1 and 10000 requests per minute.");
    }

    const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : undefined;
    if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
      throw new BadRequestException("API key expiry must be a valid date.");
    }

    return { label, scopes, environment, rateLimitPerMinute, expiresAt };
  }

  private parseProductApiKeyInput(input: unknown): {
    productCode: string;
    productName: string;
    label: string;
    scopes: string[];
    environment: ApiKeyEnvironment;
    rateLimitPerMinute: number;
    expiresAt?: string;
  } {
    const parsed = this.parseApiKeyInput(input);
    const body = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
    const productCode = typeof body.productCode === "string" ? body.productCode.trim().toUpperCase() : "";
    const productName = typeof body.productName === "string" ? body.productName.trim() : "";
    const allowedProducts = new Set(["INSTITUTION_PORTAL", "STUDENT_APP", "EMPLOYER_VERIFICATION_PORTAL", "EXAM_BODY_API"]);

    if (!allowedProducts.has(productCode)) {
      throw new BadRequestException("Product code must be one of INSTITUTION_PORTAL, STUDENT_APP, EMPLOYER_VERIFICATION_PORTAL, or EXAM_BODY_API.");
    }
    if (productName.length < 2) {
      throw new BadRequestException("Product name is required.");
    }

    return {
      ...parsed,
      productCode,
      productName
    };
  }

  private mapApplicationType(type: string): "PRIMARY" | "SECONDARY" | "TERTIARY" | "EXAM_BODY" {
    if (type === "EXAM_BODY") {
      return "EXAM_BODY";
    }
    if (["POLYTECHNIC", "COLLEGE_OF_EDUCATION", "UNIVERSITY"].includes(type)) {
      return "TERTIARY";
    }
    if (["SECONDARY_JSS", "SECONDARY_SSS", "COMBINED_SCHOOL"].includes(type)) {
      return "SECONDARY";
    }
    return "PRIMARY";
  }

  private createClientId(environment: "SANDBOX" | "PRODUCTION") {
    const prefix = environment === "PRODUCTION" ? "ak_live" : "ak_sandbox";
    return `${prefix}_${randomBytes(18).toString("base64url")}`;
  }

  private createClientSecret(environment: "SANDBOX" | "PRODUCTION") {
    const prefix = environment === "PRODUCTION" ? "sk_live" : "sk_sandbox";
    return `${prefix}_${randomBytes(32).toString("base64url")}`;
  }

  private createInviteToken() {
    return `inv_${randomBytes(32).toString("base64url")}`;
  }

  private hashInviteToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private defaultPermissionsForRole(role: UserRole) {
    if (role === UserRole.REGISTRAR) {
      return ["staff:manage", "ingest:write", "govern:review", "govern:publish", "records:amend", "developer_tools:manage", "record_requests:approve"];
    }
    if (role === UserRole.EXAM_OFFICER) {
      return ["students:read", "results:read", "govern:review", "record_requests:verify"];
    }
    if (role === UserRole.DATA_ENTRY_OFFICER) {
      return ["students:write", "ingest:write", "results:draft", "govern:submit", "record_requests:upload"];
    }
    if (role === UserRole.READ_ONLY) {
      return ["students:read", "results:read", "credentials:read", "reports:read"];
    }
    return [];
  }

  private safeApiKeySelect() {
    return {
      uuid: true,
      ownerType: true,
      institutionId: true,
      productCode: true,
      productName: true,
      clientId: true,
      label: true,
      scopes: true,
      environment: true,
      status: true,
      rateLimitPerMinute: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
      revokedReason: true,
      createdAt: true,
      updatedAt: true
    } satisfies Prisma.ApiKeySelect;
  }

  private disputeInclude() {
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
      learner: {
        select: {
          uuid: true,
          ain: true,
          fullName: true,
          identityStatus: true
        }
      },
      credential: {
        select: {
          uuid: true,
          credentialRef: true,
          type: true,
          status: true
        }
      },
      assignedTo: {
        select: {
          uuid: true,
          fullName: true,
          email: true
        }
      }
    } satisfies Prisma.DisputeInclude;
  }

  private describeScopeViewed(scopeViewed: Prisma.JsonValue): string {
    if (!scopeViewed || typeof scopeViewed !== "object" || Array.isArray(scopeViewed)) {
      return "No fields";
    }

    const viewed = scopeViewed as Record<string, unknown>;
    if (typeof viewed.scope === "string") {
      return viewed.scope;
    }
    if (typeof viewed.cryptographicStatus === "string") {
      return `status:${viewed.cryptographicStatus}`;
    }
    if (viewed.vcPayload) {
      return "FULL";
    }

    return Object.keys(viewed).slice(0, 5).join(", ") || "Summary";
  }

  private countRowsByStatus<Row extends { status: string; _count: { _all: number } }>(rows: Row[]) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + row._count._all);
    }
    return Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((left, right) => left.status.localeCompare(right.status));
  }

  private describeAcademicStructure(structure: { type: string; name: string; code: string | null }) {
    return `${this.humanizeAuditAction(structure.type)} / ${structure.name}${structure.code ? ` (${structure.code})` : ""}`;
  }

  private async readAuditEvents(options: { search?: string; targetType?: string; action?: string; outcome?: string; take?: number } = {}) {
    const search = options.search?.trim();
    const where: Prisma.AuditEventWhereInput = {
      ...(options.targetType ? { targetType: options.targetType } : {}),
      ...(options.action ? { action: { contains: options.action.trim(), mode: "insensitive" } } : {}),
      ...(options.outcome ? { outcome: { equals: options.outcome.trim(), mode: "insensitive" } } : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" } },
              { targetType: { contains: search, mode: "insensitive" } },
              { targetId: { contains: search, mode: "insensitive" } },
              { requestId: { contains: search, mode: "insensitive" } },
              { clientId: { contains: search, mode: "insensitive" } },
              { endpoint: { contains: search, mode: "insensitive" } },
              { outcome: { contains: search, mode: "insensitive" } },
              { reason: { contains: search, mode: "insensitive" } },
              {
                institution: {
                  is: {
                    OR: [
                      { officialName: { contains: search, mode: "insensitive" } },
                      { institutionId: { contains: search, mode: "insensitive" } },
                      { state: { contains: search, mode: "insensitive" } }
                    ]
                  }
                }
              },
              {
                actor: {
                  is: {
                    OR: [
                      { fullName: { contains: search, mode: "insensitive" } },
                      { email: { contains: search, mode: "insensitive" } }
                    ]
                  }
                }
              }
            ]
          }
        : {})
    };

    const events = await this.prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options.take ?? 200,
      select: {
        uuid: true,
        requestId: true,
        actorType: true,
        actorUserId: true,
        clientId: true,
        action: true,
        targetType: true,
        targetId: true,
        entityType: true,
        entityId: true,
        outcome: true,
        reason: true,
        actorRole: true,
        role: true,
        endpoint: true,
        httpMethod: true,
        ipAddressHash: true,
        userAgentHash: true,
        createdAt: true,
        institution: {
          select: {
            uuid: true,
            institutionId: true,
            officialName: true
          }
        },
        actor: {
          select: {
            uuid: true,
            fullName: true,
            email: true
          }
        }
      }
    });

    return events.map((event) => ({
      id: event.uuid,
      requestId: event.requestId,
      actorType: event.actorType,
      actorUserId: event.actorUserId,
      clientId: event.clientId,
      action: event.action,
      label: this.humanizeAuditAction(event.action),
      targetType: event.targetType,
      targetId: event.targetId,
      entityType: event.entityType ?? event.targetType,
      entityId: event.entityId ?? event.targetId,
      outcome: event.outcome,
      reason: event.reason,
      actorRole: event.actorRole,
      role: event.role ?? event.actorRole,
      endpoint: event.endpoint,
      httpMethod: event.httpMethod,
      hasIpAddressHash: Boolean(event.ipAddressHash),
      hasUserAgentHash: Boolean(event.userAgentHash),
      actorName: event.actor?.fullName ?? event.actorRole ?? "System",
      actorEmail: event.actor?.email ?? null,
      institutionId: event.institution?.institutionId ?? null,
      institutionName: event.institution?.officialName ?? null,
      createdAt: event.createdAt
    }));
  }

  private async readDailyGatewayUsage(days: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const entries = Array.from({ length: days }, (_, index) => {
      const start = new Date(today);
      start.setDate(today.getDate() - (days - 1 - index));
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      return { start, end };
    });

    return Promise.all(
      entries.map(async ({ start, end }) => {
        const [verification, audit] = await Promise.all([
          this.prisma.verificationEvent.count({ where: { verifiedAt: { gte: start, lt: end } } }),
          this.prisma.auditEvent.count({ where: { createdAt: { gte: start, lt: end } } })
        ]);
        return {
          day: start.toISOString().slice(0, 10),
          verification,
          audit,
          total: verification + audit
        };
      })
    );
  }

  private humanizeAuditAction(action: string) {
    return action
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private parseWebhookEndpointInput(input: unknown) {
    const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const targetUrl = typeof body.targetUrl === "string" ? body.targetUrl.trim() : "";
    const eventTypes = Array.isArray(body.eventTypes)
      ? body.eventTypes.map((eventType) => String(eventType).trim()).filter(Boolean).slice(0, 50)
      : [];

    if (!label || label.length > 120) {
      throw new BadRequestException("Webhook endpoint label is required and must be 120 characters or fewer.");
    }
    try {
      const url = new URL(targetUrl);
      if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
        throw new Error("Production webhook endpoints must use HTTPS.");
      }
      if (!["https:", "http:"].includes(url.protocol)) {
        throw new Error("Webhook endpoint must use HTTP or HTTPS.");
      }
    } catch {
      throw new BadRequestException("Webhook endpoint targetUrl must be a valid HTTP or HTTPS URL.");
    }

    return { label, targetUrl, eventTypes };
  }

  private webhookSecretManager() {
    if (!this.webhookSecrets) {
      throw new BadRequestException("Webhook secret service is unavailable.");
    }
    return this.webhookSecrets;
  }

  private webhookEndpointInclude() {
    return {
      institution: {
        select: {
          uuid: true,
          institutionId: true,
          officialName: true
        }
      },
      createdBy: {
        select: {
          uuid: true,
          fullName: true,
          email: true
        }
      }
    } as const;
  }

  private webhookDeliveryInclude() {
    return {
      institution: {
        select: {
          uuid: true,
          institutionId: true,
          officialName: true
        }
      },
      webhookEndpoint: {
        select: {
          uuid: true,
          label: true,
          status: true,
          secretPreview: true
        }
      },
      job: {
        select: {
          uuid: true,
          status: true,
          attempts: true,
          maxAttempts: true,
          runAfter: true,
          error: true
        }
      }
    } as const;
  }

  private deadLetterJobInclude() {
    return {
      institution: {
        select: {
          uuid: true,
          institutionId: true,
          officialName: true
        }
      },
      createdBy: {
        select: {
          uuid: true,
          fullName: true,
          email: true
        }
      },
      webhookDeliveries: {
        select: {
          uuid: true,
          status: true,
          eventType: true,
          attempts: true,
          lastStatusCode: true,
          lastError: true,
          updatedAt: true
        },
        orderBy: { updatedAt: "desc" as const },
        take: 3
      },
      notifications: {
        select: {
          uuid: true,
          channel: true,
          type: true,
          title: true,
          status: true,
          error: true,
          updatedAt: true
        },
        orderBy: { updatedAt: "desc" as const },
        take: 3
      }
    } as const;
  }

  private safeWebhookEndpoint(endpoint: Prisma.WebhookEndpointGetPayload<{ include: ReturnType<AdminService["webhookEndpointInclude"]> }>) {
    return {
      id: endpoint.uuid,
      institutionUuid: endpoint.institutionId,
      institutionId: endpoint.institution.institutionId,
      institutionName: endpoint.institution.officialName,
      label: endpoint.label,
      targetUrl: endpoint.targetUrl,
      eventTypes: endpoint.eventTypes,
      secretPreview: endpoint.secretPreview,
      status: endpoint.status,
      rotatedAt: endpoint.rotatedAt,
      disabledAt: endpoint.disabledAt,
      createdBy: endpoint.createdBy,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt
    };
  }

  private safeWebhookDelivery(delivery: Prisma.WebhookDeliveryGetPayload<{ include: ReturnType<AdminService["webhookDeliveryInclude"]> }>) {
    return {
      id: delivery.uuid,
      jobId: delivery.jobId,
      eventId: delivery.eventId,
      institutionUuid: delivery.institutionId,
      institutionId: delivery.institution?.institutionId ?? null,
      institutionName: delivery.institution?.officialName ?? null,
      webhookEndpointId: delivery.webhookEndpointId,
      webhookEndpoint: delivery.webhookEndpoint,
      targetUrl: delivery.targetUrl,
      eventType: delivery.eventType,
      status: delivery.status,
      attempts: delivery.attempts,
      nextAttemptAt: delivery.nextAttemptAt,
      lastStatusCode: delivery.lastStatusCode,
      lastError: delivery.lastError,
      deliveredAt: delivery.deliveredAt,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
      job: delivery.job
    };
  }

  private safeDeadLetterJob(job: Prisma.BackgroundJobGetPayload<{ include: ReturnType<AdminService["deadLetterJobInclude"]> }>) {
    return {
      id: job.uuid,
      type: job.type,
      queue: job.queue,
      status: job.status,
      institutionUuid: job.institutionId,
      institutionId: job.institution?.institutionId ?? null,
      institutionName: job.institution?.officialName ?? null,
      createdBy: job.createdBy,
      relatedEntityType: job.relatedEntityType,
      relatedEntityId: job.relatedEntityId,
      priority: job.priority,
      progress: job.progress,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      runAfter: job.runAfter,
      error: job.error,
      failedAt: job.failedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      linkedWebhookDeliveries: job.webhookDeliveries,
      linkedNotifications: job.notifications
    };
  }

  private async createWebhookJob(
    tx: Prisma.TransactionClient,
    delivery: {
      uuid: string;
      institutionId: string | null;
      webhookEndpointId: string | null;
      targetUrl: string;
      eventType: string;
    },
    eventType: string
  ) {
    const job = await tx.backgroundJob.create({
      data: {
        type: BackgroundJobType.WEBHOOK_DELIVERY,
        queue: "webhooks.delivery",
        institutionId: delivery.institutionId,
        relatedEntityType: "WebhookDelivery",
        relatedEntityId: delivery.uuid,
        priority: 1,
        maxAttempts: this.retryPolicy.maxAttemptsFor(BackgroundJobType.WEBHOOK_DELIVERY),
        payload: {
          deliveryId: delivery.uuid,
          webhookEndpointId: delivery.webhookEndpointId,
          targetUrl: delivery.targetUrl,
          eventType: delivery.eventType
        }
      }
    });
    await tx.domainEvent.create({
      data: {
        type: eventType,
        aggregateType: "WebhookDelivery",
        aggregateId: delivery.uuid,
        institutionId: delivery.institutionId,
        jobId: job.uuid,
        payload: {
          deliveryId: delivery.uuid,
          jobId: job.uuid,
          webhookEndpointId: delivery.webhookEndpointId,
          targetUrl: delivery.targetUrl,
          eventType: delivery.eventType
        }
      }
    });
    return job;
  }

  private webhookJobResponse(job: { uuid: string; status: string; type?: string; queue?: string }) {
    return {
      id: job.uuid,
      jobId: job.uuid,
      status: job.status,
      pollingUrl: `/jobs/${job.uuid}`
    };
  }

  private async checkDatabase() {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        name: "Database",
        status: "OPERATIONAL" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        message: "PostgreSQL connection is healthy."
      };
    } catch (error) {
      return {
        name: "Database",
        status: "DOWN" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        message: this.safeErrorMessage(error, "Database connection failed.")
      };
    }
  }

  private async checkAuthService() {
    const startedAt = Date.now();
    try {
      const founderCount = await this.prisma.user.count({
        where: { role: "ACADID_SUPER_ADMIN" }
      });
      return {
        name: "Authentication Service",
        status: founderCount > 0 ? ("OPERATIONAL" as HealthStatus) : ("DEGRADED" as HealthStatus),
        responseTimeMs: Date.now() - startedAt,
        message: founderCount > 0 ? "Founder authentication records are available." : "No founder account found."
      };
    } catch (error) {
      return {
        name: "Authentication Service",
        status: "DEGRADED" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        message: this.safeErrorMessage(error, "Authentication data check failed.")
      };
    }
  }

  private async checkConfiguredService(name: string, configured: boolean) {
    return {
      name,
      status: configured ? ("OPERATIONAL" as HealthStatus) : ("PENDING_CONFIGURATION" as HealthStatus),
      responseTimeMs: 0,
      message: configured ? `${name} configuration is present.` : `${name} is not configured for this environment yet.`
    };
  }

  private async checkStorageService() {
    if (!this.objectStorage) {
      return {
        name: "Storage Service",
        status: "PENDING_CONFIGURATION" as HealthStatus,
        responseTimeMs: 0,
        message: "Storage health service is not available in this context.",
        metadata: {
          provider: "unconfigured",
          configured: false,
          bucket: null,
          downloadBaseConfigured: false,
          supabaseUrlConfigured: false,
          serviceRoleConfigured: false,
          probeConfigured: false,
          probeSucceeded: null,
          probeSource: null,
          probeBytes: null,
          probeKeyHash: null
        }
      };
    }

    const health = await this.objectStorage.checkDownloadHealth();
    return {
      name: "Storage Service",
      status: health.status as HealthStatus,
      responseTimeMs: health.responseTimeMs,
      message: health.message,
      metadata: health.metadata
    };
  }

  private async checkCacheService() {
    const stats = this.cache ? await this.cache.distributedStats() : { entries: 0, tags: 0, adapter: "memory", distributedConfigured: false };
    const distributedConfigured = Boolean("distributedConfigured" in stats && stats.distributedConfigured);
    return {
      name: "Cache Service",
      status: "OPERATIONAL" as HealthStatus,
      responseTimeMs: 0,
      message: distributedConfigured
        ? "L1 memory cache with distributed L2 adapter is available for safe read-heavy surfaces."
        : "In-process TTL cache is available for safe read-heavy surfaces.",
      metadata: stats
    };
  }

  private async checkLogSink() {
    const status = this.structuredLogger?.externalSinkStatus() ?? {
      configured: Boolean(process.env.ACADID_LOG_SINK_URL),
      provider: process.env.ACADID_LOG_SINK_URL ? "http" : "console",
      endpointHost: this.safeHost(process.env.ACADID_LOG_SINK_URL),
      lastStatusCode: null,
      lastError: null,
      delivered: 0,
      failed: 0
    };
    return {
      name: "Log Sink",
      status: status.configured ? (status.failed > 0 ? ("DEGRADED" as HealthStatus) : ("OPERATIONAL" as HealthStatus)) : ("PENDING_CONFIGURATION" as HealthStatus),
      responseTimeMs: 0,
      message: status.configured ? `External ${status.provider} log sink is configured.` : "Structured logs are writing to console only.",
      metadata: status
    };
  }

  private async checkQueueWorkers() {
    const startedAt = Date.now();
    const now = new Date();
    const staleLockedBefore = new Date(now.getTime() - 15 * 60 * 1000);
    const staleWorkerBefore = new Date(now.getTime() - 2 * 60 * 1000);
    const workerHeartbeat = (
      this.prisma as unknown as {
        workerHeartbeat?: {
          count: (args: unknown) => Promise<number>;
          findMany: (args: unknown) => Promise<
            Array<{
              workerId: string;
              hostname: string | null;
              processId: number | null;
              queues: string[];
              status: string;
              concurrency: number;
              currentJobId: string | null;
              currentQueue: string | null;
              lastStartedAt: Date | null;
              lastSeenAt: Date;
              updatedAt: Date;
            }>
          >;
        };
      }
    ).workerHeartbeat;
    try {
      const [
        readyBacklog,
        scheduledBacklog,
        runningJobs,
        failedJobs24h,
        staleRunningJobs,
        byQueue,
        recentWorkers,
        activeWorkers,
        staleWorkers,
        stoppedWorkers,
        workerHeartbeats
      ] = await Promise.all([
        this.prisma.backgroundJob.count({
          where: {
            status: { in: ["QUEUED", "RETRYING"] },
            runAfter: { lte: now }
          }
        }),
        this.prisma.backgroundJob.count({
          where: {
            status: { in: ["QUEUED", "RETRYING"] },
            runAfter: { gt: now }
          }
        }),
        this.prisma.backgroundJob.count({ where: { status: "RUNNING" } }),
        this.prisma.backgroundJob.count({
          where: {
            status: "FAILED",
            failedAt: { gte: this.hoursAgo(24) }
          }
        }),
        this.prisma.backgroundJob.count({
          where: {
            status: "RUNNING",
            lockedAt: { lt: staleLockedBefore }
          }
        }),
        this.prisma.backgroundJob.groupBy({
          by: ["queue", "status"],
          _count: { _all: true },
          where: {
            status: { in: ["QUEUED", "RETRYING", "RUNNING", "FAILED"] }
          },
          orderBy: [{ queue: "asc" }, { status: "asc" }]
        }),
        this.prisma.backgroundJob.findMany({
          where: {
            lockedBy: { not: null }
          },
          select: {
            uuid: true,
            queue: true,
            type: true,
            status: true,
            lockedBy: true,
            lockedAt: true,
            startedAt: true,
            completedAt: true,
            failedAt: true,
            updatedAt: true
          },
          orderBy: { updatedAt: "desc" },
          take: 10
        }),
        workerHeartbeat
          ? workerHeartbeat.count({
              where: {
                status: WorkerHeartbeatStatus.ACTIVE,
                lastSeenAt: { gte: staleWorkerBefore }
              }
            })
          : Promise.resolve(0),
        workerHeartbeat
          ? workerHeartbeat.count({
              where: {
                status: WorkerHeartbeatStatus.ACTIVE,
                lastSeenAt: { lt: staleWorkerBefore }
              }
            })
          : Promise.resolve(0),
        workerHeartbeat
          ? workerHeartbeat.count({
              where: {
                status: WorkerHeartbeatStatus.STOPPED,
                updatedAt: { gte: this.hoursAgo(24) }
              }
            })
          : Promise.resolve(0),
        workerHeartbeat
          ? workerHeartbeat.findMany({
              orderBy: { lastSeenAt: "desc" },
              take: 20
            })
          : Promise.resolve([])
      ]);

      const status: HealthStatus = staleWorkers > 0 || staleRunningJobs > 0 || failedJobs24h > 0 || readyBacklog > 500 ? "DEGRADED" : "OPERATIONAL";
      const message =
        status === "OPERATIONAL"
          ? `${readyBacklog} ready job(s), ${runningJobs} running, ${activeWorkers} active worker(s).`
          : `${readyBacklog} ready job(s), ${failedJobs24h} failed in 24h, ${staleRunningJobs} stale job(s), ${staleWorkers} stale worker(s).`;

      return {
        name: "Background Workers",
        status,
        responseTimeMs: Date.now() - startedAt,
        message,
        metadata: {
          readyBacklog,
          scheduledBacklog,
          runningJobs,
          failedJobs24h,
          staleRunningJobs,
          activeWorkers,
          staleWorkers,
          stoppedWorkers,
          workerStaleAfterSeconds: 120,
          queues: this.normaliseQueueBreakdown(byQueue),
          recentWorkers: recentWorkers.map((job) => ({
            jobId: job.uuid,
            queue: job.queue,
            type: job.type,
            status: job.status,
            lockedBy: job.lockedBy,
            lockedAt: job.lockedAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            failedAt: job.failedAt,
            updatedAt: job.updatedAt
          })),
          workerHeartbeats: workerHeartbeats.map((worker) => ({
            workerId: worker.workerId,
            hostname: worker.hostname,
            processId: worker.processId,
            queues: worker.queues,
            status: worker.status,
            concurrency: worker.concurrency,
            currentJobId: worker.currentJobId,
            currentQueue: worker.currentQueue,
            lastStartedAt: worker.lastStartedAt,
            lastSeenAt: worker.lastSeenAt,
            updatedAt: worker.updatedAt
          }))
        }
      };
    } catch (error) {
      return {
        name: "Background Workers",
        status: "DEGRADED" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        message: this.safeErrorMessage(error, "Queue and worker health check failed."),
        metadata: {
          readyBacklog: 0,
          scheduledBacklog: 0,
          runningJobs: 0,
          failedJobs24h: 0,
          staleRunningJobs: 0,
          activeWorkers: 0,
          staleWorkers: 0,
          stoppedWorkers: 0,
          workerStaleAfterSeconds: 120,
          queues: [],
          recentWorkers: [],
          workerHeartbeats: []
        }
      };
    }
  }

  private async checkWebhookDelivery() {
    const startedAt = Date.now();
    const now = new Date();
    try {
      const [pendingOrRetrying, dueNow, failed24h, delivered24h, byStatus, activeEndpoints, pendingLegacyWithoutEndpoint] = await Promise.all([
        this.prisma.webhookDelivery.count({ where: { status: { in: ["PENDING", "RETRYING"] } } }),
        this.prisma.webhookDelivery.count({
          where: {
            status: { in: ["PENDING", "RETRYING"] },
            nextAttemptAt: { lte: now }
          }
        }),
        this.prisma.webhookDelivery.count({
          where: {
            status: "FAILED",
            updatedAt: { gte: this.hoursAgo(24) }
          }
        }),
        this.prisma.webhookDelivery.count({
          where: {
            status: "DELIVERED",
            deliveredAt: { gte: this.hoursAgo(24) }
          }
        }),
        this.prisma.webhookDelivery.groupBy({
          by: ["status"],
          _count: { _all: true },
          orderBy: { status: "asc" }
        }),
        this.prisma.webhookEndpoint.count({ where: { status: "ACTIVE" } }),
        this.prisma.webhookDelivery.count({ where: { status: { in: ["PENDING", "RETRYING"] }, webhookEndpointId: null } })
      ]);
      const missingSecret = !process.env.ACADID_WEBHOOK_SECRET;
      const status: HealthStatus = failed24h > 0 || dueNow > 50 || (missingSecret && pendingLegacyWithoutEndpoint > 0) ? "DEGRADED" : "OPERATIONAL";
      return {
        name: "Webhook Delivery",
        status,
        responseTimeMs: Date.now() - startedAt,
        message:
          status === "OPERATIONAL"
            ? `${delivered24h} delivered in 24h; ${pendingOrRetrying} pending or retrying.`
            : `${failed24h} failed in 24h; ${dueNow} due now; ${pendingOrRetrying} pending or retrying.`,
        metadata: {
          pendingOrRetrying,
          dueNow,
          failed24h,
          delivered24h,
          activeEndpoints,
          legacyGlobalSecretConfigured: !missingSecret,
          pendingLegacyWithoutEndpoint,
          statusBreakdown: byStatus.map((row) => ({
            status: row.status,
            count: row._count._all
          }))
        }
      };
    } catch (error) {
      return {
        name: "Webhook Delivery",
        status: "DEGRADED" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        message: this.safeErrorMessage(error, "Webhook delivery check failed."),
        metadata: {
          pendingOrRetrying: 0,
          dueNow: 0,
          failed24h: 0,
          delivered24h: 0,
          activeEndpoints: 0,
          legacyGlobalSecretConfigured: Boolean(process.env.ACADID_WEBHOOK_SECRET),
          pendingLegacyWithoutEndpoint: 0,
          statusBreakdown: []
        }
      };
    }
  }

  private async checkCredentialSigning() {
    try {
      const readiness = this.credentialSigning?.readiness();
      if (!readiness) {
        return {
          name: "Credential Signing",
          status: "PENDING_CONFIGURATION" as HealthStatus,
          responseTimeMs: 0,
          message: "Credential signing service is not available in this context."
        };
      }
      return {
        name: "Credential Signing",
        status: readiness.productionReady ? ("OPERATIONAL" as HealthStatus) : ("DEGRADED" as HealthStatus),
        responseTimeMs: 0,
        message: readiness.productionReady
          ? `${readiness.algorithm}/${readiness.curve} ${readiness.proofProfile} signer is using configured deployment keys.`
          : readiness.warning ?? "Credential signing is not production-ready.",
        metadata: {
          proofProfile: readiness.proofProfile,
          algorithm: readiness.algorithm,
          curve: readiness.curve,
          verificationMethod: readiness.verificationMethod,
          keySource: readiness.keySource,
          productionReady: readiness.productionReady
        }
      };
    } catch (error) {
      return {
        name: "Credential Signing",
        status: "DOWN" as HealthStatus,
        responseTimeMs: 0,
        message: this.safeErrorMessage(error, "Credential signing check failed.")
      };
    }
  }

  private async checkRateLimitBuckets() {
    const startedAt = Date.now();
    try {
      if (!this.rateLimit) {
        return {
          name: "Rate Limit Buckets",
          status: "PENDING_CONFIGURATION" as HealthStatus,
          responseTimeMs: 0,
          message: "Rate-limit service is not available in this context.",
          metadata: {
            recentHours: 24,
            staleAfterHours: 24,
            totalBuckets: 0,
            recentBuckets: 0,
            staleBuckets: 0,
            totalRequests: 0,
            recentRequests: 0,
            topScopes: []
          }
        };
      }
      const summary = await this.rateLimitManager().readBucketSummary({ recentHours: 24, staleAfterHours: 24 });
      const status: HealthStatus = summary.staleBuckets > 100_000 ? "DEGRADED" : "OPERATIONAL";
      return {
        name: "Rate Limit Buckets",
        status,
        responseTimeMs: Date.now() - startedAt,
        message:
          status === "OPERATIONAL"
            ? `${summary.recentBuckets} recent bucket(s), ${summary.staleBuckets} stale bucket(s).`
            : `${summary.staleBuckets} stale bucket(s) should be cleaned by the maintenance worker.`,
        metadata: {
          recentHours: summary.recentHours,
          staleAfterHours: summary.staleAfterHours,
          totalBuckets: summary.totalBuckets,
          recentBuckets: summary.recentBuckets,
          staleBuckets: summary.staleBuckets,
          totalRequests: summary.totalRequests,
          recentRequests: summary.recentRequests,
          topScopes: summary.topScopes
        }
      };
    } catch (error) {
      return {
        name: "Rate Limit Buckets",
        status: "DEGRADED" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        message: this.safeErrorMessage(error, "Rate-limit bucket health check failed."),
        metadata: {
          recentHours: 24,
          staleAfterHours: 24,
          totalBuckets: 0,
          recentBuckets: 0,
          staleBuckets: 0,
          totalRequests: 0,
          recentRequests: 0,
          topScopes: []
        }
      };
    }
  }

  private async checkIdempotencyRecords() {
    const startedAt = Date.now();
    try {
      if (!this.idempotency) {
        return {
          name: "Idempotency Ledger",
          status: "PENDING_CONFIGURATION" as HealthStatus,
          responseTimeMs: 0,
          message: "Idempotency service is not configured.",
          metadata: {
            totalRecords: 0,
            expiredRecords: 0,
            staleInProgressRecords: 0,
            failedRecords: 0
          }
        };
      }
      const summary = await this.idempotencyManager().readSummary({ recentHours: 24, staleAfterHours: 2, take: 5 });
      const status: HealthStatus = summary.staleInProgressRecords > 100 || summary.failedRecords > 1000 ? "DEGRADED" : "OPERATIONAL";
      return {
        name: "Idempotency Ledger",
        status,
        responseTimeMs: Date.now() - startedAt,
        message:
          status === "OPERATIONAL"
            ? "Retry-safe POST/job dedupe ledger is active."
            : "Idempotency ledger has stale or failed records requiring review.",
        metadata: summary
      };
    } catch (error) {
      return {
        name: "Idempotency Ledger",
        status: "DEGRADED" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        message: this.safeErrorMessage(error, "Idempotency ledger check failed."),
        metadata: {
          totalRecords: 0,
          expiredRecords: 0,
          staleInProgressRecords: 0,
          failedRecords: 0
        }
      };
    }
  }

  private async checkNotificationDelivery() {
    const startedAt = Date.now();
    try {
      const since = this.hoursAgo(24);
      const [pending, failed24h, sent24h, byChannelStatus, recentFailures] = await Promise.all([
        this.prisma.notification.count({ where: { status: "PENDING" } }),
        this.prisma.notification.count({ where: { status: "FAILED", failedAt: { gte: since } } }),
        this.prisma.notification.count({ where: { status: "SENT", sentAt: { gte: since } } }),
        this.prisma.notification.groupBy({
          by: ["channel", "status"],
          _count: { _all: true },
          orderBy: [{ channel: "asc" }, { status: "asc" }]
        }),
        this.prisma.notification.findMany({
          where: { status: "FAILED" },
          include: this.notificationInclude(),
          orderBy: { updatedAt: "desc" },
          take: 10
        })
      ]);
      const providers = this.notificationProviderHealth();
      const requireProvider = process.env.ACADID_REQUIRE_NOTIFICATION_PROVIDER === "true";
      const missingRequiredProvider = requireProvider && (!providers.email.configured || !providers.sms.configured);
      const status: HealthStatus = failed24h > 0 || pending > 500 || missingRequiredProvider ? "DEGRADED" : "OPERATIONAL";
      return {
        name: "Notification Delivery",
        status,
        responseTimeMs: Date.now() - startedAt,
        message:
          status === "OPERATIONAL"
            ? "Email, SMS, and push delivery queues are healthy."
            : "Notification delivery needs review for failed, pending, or missing provider configuration.",
        metadata: {
          pending,
          failed24h,
          sent24h,
          providers,
          channelBreakdown: byChannelStatus.map((row) => ({ channel: row.channel, status: row.status, count: row._count._all })),
          recentFailures: recentFailures.map((notification) => this.safeNotification(notification))
        }
      };
    } catch (error) {
      return {
        name: "Notification Delivery",
        status: "DEGRADED" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        message: this.safeErrorMessage(error, "Notification delivery check failed."),
        metadata: {
          pending: 0,
          failed24h: 0,
          sent24h: 0,
          providers: this.notificationProviderHealth(),
          channelBreakdown: [],
          recentFailures: []
        }
      };
    }
  }

  private async readGatewayMetrics() {
    const startedAt = Date.now();
    const since = this.hoursAgo(24);
    try {
      const [
        verificationEventsToday,
        deniedVerificationEvents,
        revokedVerificationEvents,
        discrepancyEvents,
        auditEventsToday,
        failedAuditEvents,
        publishedCredentialsToday,
        readyBackgroundJobs,
        failedBackgroundJobs,
        pendingWebhooks,
        failedWebhooks
      ] =
        await Promise.all([
          this.prisma.verificationEvent.count({ where: { verifiedAt: { gte: since } } }),
          this.prisma.verificationEvent.count({ where: { verifiedAt: { gte: since }, outcome: "DENIED" } }),
          this.prisma.verificationEvent.count({ where: { verifiedAt: { gte: since }, outcome: "REVOKED" } }),
          this.prisma.verificationEvent.count({ where: { verifiedAt: { gte: since }, outcome: "DISCREPANCY" } }),
          this.prisma.auditEvent.count({ where: { createdAt: { gte: since } } }),
          this.prisma.auditEvent.count({ where: { createdAt: { gte: since }, outcome: { not: "SUCCESS" } } }),
          this.prisma.credential.count({ where: { issuedAt: { gte: since } } }),
          this.prisma.backgroundJob.count({ where: { status: { in: ["QUEUED", "RETRYING"] }, runAfter: { lte: new Date() } } }),
          this.prisma.backgroundJob.count({ where: { status: "FAILED", failedAt: { gte: since } } }),
          this.prisma.webhookDelivery.count({ where: { status: { in: ["PENDING", "RETRYING"] } } }),
          this.prisma.webhookDelivery.count({ where: { status: "FAILED", updatedAt: { gte: since } } })
        ]);
      const gatewayRequestsToday = verificationEventsToday + auditEventsToday;
      const failedEvents = deniedVerificationEvents + revokedVerificationEvents + discrepancyEvents + failedAuditEvents;
      const errorRate = gatewayRequestsToday > 0 ? Number(((failedEvents / gatewayRequestsToday) * 100).toFixed(2)) : 0;

      return {
        status: "OPERATIONAL" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        gatewayRequestsToday,
        verificationEventsToday,
        deniedVerificationEvents,
        revokedVerificationEvents,
        discrepancyEvents,
        auditEventsToday,
        failedAuditEvents,
        publishedCredentialsToday,
        readyBackgroundJobs,
        failedBackgroundJobs,
        pendingWebhooks,
        failedWebhooks,
        errorRate
      };
    } catch (error) {
      return {
        status: "DEGRADED" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        gatewayRequestsToday: 0,
        verificationEventsToday: 0,
        deniedVerificationEvents: 0,
        revokedVerificationEvents: 0,
        discrepancyEvents: 0,
        auditEventsToday: 0,
        failedAuditEvents: 0,
        publishedCredentialsToday: 0,
        readyBackgroundJobs: 0,
        failedBackgroundJobs: 0,
        pendingWebhooks: 0,
        failedWebhooks: 0,
        errorRate: 0,
        message: this.safeErrorMessage(error, "Gateway metrics query failed.")
      };
    }
  }

  private deriveIncidents(
    services: Array<{ name: string; status: HealthStatus; message: string }>,
    metrics: {
      status: HealthStatus;
      failedAuditEvents: number;
      deniedVerificationEvents: number;
      revokedVerificationEvents: number;
      discrepancyEvents: number;
      failedBackgroundJobs?: number;
      failedWebhooks?: number;
      readyBackgroundJobs?: number;
      pendingWebhooks?: number;
      errorRate?: number;
      message?: string;
    }
  ) {
    const thresholds = this.alertThresholds();
    const incidents = services
      .filter((service) => service.status === "DOWN" || service.status === "DEGRADED")
      .map((service) => ({
        title: `${service.name} ${service.status.toLowerCase()}`,
        severity: service.status === "DOWN" ? "CRITICAL" : "WARNING",
        status: "OPEN",
        message: service.message,
        detectedAt: new Date()
      }));

    if (metrics.status === "DEGRADED" && metrics.message) {
      incidents.push({
        title: "Gateway metrics degraded",
        severity: "WARNING",
        status: "OPEN",
        message: metrics.message,
        detectedAt: new Date()
      });
    }

    const riskEvents = metrics.failedAuditEvents + metrics.deniedVerificationEvents + metrics.revokedVerificationEvents + metrics.discrepancyEvents;
    if (riskEvents > 0) {
      incidents.push({
        title: "Gateway risk events detected",
        severity: "INFO",
        status: "OPEN",
        message: `${riskEvents} denied, revoked, discrepancy, or failed audit event(s) in the last 24 hours.`,
        detectedAt: new Date()
      });
    }

    if ((metrics.errorRate ?? 0) >= thresholds.gatewayErrorRatePercent) {
      incidents.push({
        title: "Gateway error-rate threshold exceeded",
        severity: "CRITICAL",
        status: "OPEN",
        message: `Gateway error rate is ${metrics.errorRate}% over the ${thresholds.gatewayErrorRatePercent}% threshold.`,
        detectedAt: new Date()
      });
    }

    if ((metrics.readyBackgroundJobs ?? 0) >= thresholds.readyBackgroundJobs) {
      incidents.push({
        title: "Queue backlog threshold exceeded",
        severity: "WARNING",
        status: "OPEN",
        message: `${metrics.readyBackgroundJobs} ready background job(s) exceed the ${thresholds.readyBackgroundJobs} threshold.`,
        detectedAt: new Date()
      });
    }

    if ((metrics.pendingWebhooks ?? 0) >= thresholds.pendingWebhooks) {
      incidents.push({
        title: "Webhook backlog threshold exceeded",
        severity: "WARNING",
        status: "OPEN",
        message: `${metrics.pendingWebhooks} pending webhook(s) exceed the ${thresholds.pendingWebhooks} threshold.`,
        detectedAt: new Date()
      });
    }

    if ((metrics.failedBackgroundJobs ?? 0) >= thresholds.failedBackgroundJobs24h) {
      incidents.push({
        title: "Background job failures detected",
        severity: "WARNING",
        status: "OPEN",
        message: `${metrics.failedBackgroundJobs} background job(s) failed in the last 24 hours.`,
        detectedAt: new Date()
      });
    }

    if ((metrics.failedWebhooks ?? 0) >= thresholds.failedWebhooks24h) {
      incidents.push({
        title: "Webhook delivery failures detected",
        severity: "WARNING",
        status: "OPEN",
        message: `${metrics.failedWebhooks} webhook delivery attempt(s) failed in the last 24 hours.`,
        detectedAt: new Date()
      });
    }

    return incidents.slice(0, 10);
  }

  private normaliseQueueBreakdown(rows: Array<{ queue: string; status: string; _count: { _all: number } }>) {
    const queues = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const current = queues.get(row.queue) ?? {};
      current[row.status] = (current[row.status] ?? 0) + row._count._all;
      queues.set(row.queue, current);
    }
    return Array.from(queues.entries()).map(([queue, counts]) => ({
      queue,
      queued: counts.QUEUED ?? 0,
      retrying: counts.RETRYING ?? 0,
      running: counts.RUNNING ?? 0,
      failed: counts.FAILED ?? 0,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0)
    }));
  }

  private safeErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }

  private alertThresholds() {
    return {
      gatewayErrorRatePercent: this.parseEnvNumber("ACADID_ALERT_GATEWAY_ERROR_RATE_PERCENT", 5),
      readyBackgroundJobs: this.parseEnvNumber("ACADID_ALERT_READY_BACKGROUND_JOBS", 1000),
      pendingWebhooks: this.parseEnvNumber("ACADID_ALERT_PENDING_WEBHOOKS", 100),
      failedBackgroundJobs24h: this.parseEnvNumber("ACADID_ALERT_FAILED_BACKGROUND_JOBS_24H", 1),
      failedWebhooks24h: this.parseEnvNumber("ACADID_ALERT_FAILED_WEBHOOKS_24H", 1)
    };
  }

  private parseEnvNumber(key: string, fallback: number) {
    const value = Number(process.env[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private safeHost(value?: string) {
    if (!value) {
      return null;
    }
    try {
      return new URL(value).host;
    } catch {
      return null;
    }
  }

  private hoursAgo(hours: number) {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  private parseBoundedNumber(value: unknown, min: number, max: number, fallback: number) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }

  private parseRateLimitPolicyInput(input: unknown) {
    const source = typeof input === "object" && input && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const base = defaultPlatformSettings.rateLimits;
    const emergency = typeof source.emergency === "object" && source.emergency && !Array.isArray(source.emergency) ? (source.emergency as Record<string, unknown>) : {};
    const institutionDefaults =
      typeof source.institutionDefaultsPerMinute === "object" && source.institutionDefaultsPerMinute && !Array.isArray(source.institutionDefaultsPerMinute)
        ? (source.institutionDefaultsPerMinute as Record<string, unknown>)
        : {};

    const policy = {
      emergency: {
        enabled: emergency.enabled === true,
        limitPerMinute: this.parseBoundedNumber(emergency.limitPerMinute, 1, 100_000, base.emergency.limitPerMinute),
        reason: typeof emergency.reason === "string" && emergency.reason.trim() ? emergency.reason.trim().slice(0, 500) : null
      },
      productDefaultsPerMinute: this.parseNumberRecord(source.productDefaultsPerMinute, base.productDefaultsPerMinute, 1, 100_000),
      institutionDefaultsPerMinute: {
        sandbox: this.parseBoundedNumber(institutionDefaults.sandbox, 1, 100_000, base.institutionDefaultsPerMinute.sandbox),
        production: this.parseBoundedNumber(institutionDefaults.production, 1, 100_000, base.institutionDefaultsPerMinute.production)
      },
      institutionOverridesPerMinute: this.parseNumberRecord(source.institutionOverridesPerMinute, {}, 1, 100_000),
      scopeOverrides: this.parseRateLimitScopeOverrides(source.scopeOverrides)
    };

    if (policy.emergency.enabled && !policy.emergency.reason) {
      throw new BadRequestException("Emergency rate-limit mode requires a reason.");
    }

    return policy;
  }

  private parseNumberRecord(value: unknown, fallback: Record<string, number>, min: number, max: number) {
    const result = { ...fallback };
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return result;
    }

    for (const [rawKey, rawValue] of Object.entries(value)) {
      const key = rawKey.trim();
      if (!key) continue;
      result[key] = this.parseBoundedNumber(rawValue, min, max, result[key] ?? fallback[key] ?? min);
    }
    return result;
  }

  private parseRateLimitScopeOverrides(value: unknown) {
    const result: Record<string, { limit: number; windowSeconds: number }> = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return result;
    }

    for (const [rawScope, rawValue] of Object.entries(value)) {
      const scope = rawScope.trim();
      if (!scope || !rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) continue;
      const record = rawValue as Record<string, unknown>;
      result[scope] = {
        limit: this.parseBoundedNumber(record.limit, 1, 100_000, 100),
        windowSeconds: this.parseBoundedNumber(record.windowSeconds, 1, 3600, 60)
      };
    }

    return result;
  }

  private optionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
    if (typeof value !== "string" || !value.trim()) {
      return undefined;
    }
    const normalised = value.trim().toUpperCase() as T;
    return allowed.includes(normalised) ? normalised : undefined;
  }

  private notificationProviderHealth() {
    const emailProvider = process.env.RESEND_API_KEY ? "resend" : process.env.SENDGRID_API_KEY ? "sendgrid" : null;
    const smsProvider = process.env.TERMII_API_KEY
      ? "termii"
      : process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER
        ? "twilio"
        : null;
    return {
      email: {
        configured: Boolean(emailProvider),
        provider: emailProvider ?? (process.env.ACADID_REQUIRE_NOTIFICATION_PROVIDER === "true" ? "missing" : "dry-run-email")
      },
      sms: {
        configured: Boolean(smsProvider),
        provider: smsProvider ?? (process.env.ACADID_REQUIRE_NOTIFICATION_PROVIDER === "true" ? "missing" : "dry-run-sms")
      },
      push: {
        configured: true,
        provider: process.env.EXPO_ACCESS_TOKEN ? "expo-authenticated" : "expo"
      },
      requireProvider: process.env.ACADID_REQUIRE_NOTIFICATION_PROVIDER === "true"
    };
  }

  private notificationInclude() {
    return {
      institution: { select: { uuid: true, institutionId: true, officialName: true } },
      learner: { select: { uuid: true, ain: true, fullName: true } },
      user: { select: { uuid: true, email: true, fullName: true } },
      job: { select: { uuid: true, status: true, type: true, queue: true } }
    };
  }

  private safeNotification(notification: Prisma.NotificationGetPayload<{ include: ReturnType<AdminService["notificationInclude"]> }>) {
    return {
      id: notification.uuid,
      jobId: notification.jobId,
      job: notification.job,
      institutionId: notification.institution?.institutionId ?? null,
      institutionName: notification.institution?.officialName ?? null,
      learnerAin: notification.learner?.ain ?? null,
      learnerName: notification.learner?.fullName ?? null,
      userEmail: notification.user?.email ?? null,
      userName: notification.user?.fullName ?? null,
      channel: notification.channel,
      type: notification.type,
      title: notification.title,
      status: notification.status,
      sentAt: notification.sentAt,
      failedAt: notification.failedAt,
      error: notification.error,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt
    };
  }

  private rateLimitManager() {
    if (!this.rateLimit) {
      throw new BadRequestException("Rate limit service is unavailable.");
    }
    return this.rateLimit;
  }

  private idempotencyManager() {
    if (!this.idempotency) {
      throw new BadRequestException("Idempotency service is unavailable.");
    }
    return this.idempotency;
  }

  private daysAgo(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  private async readDailyRevenue(chartStart: Date) {
    return this.prisma.$queryRaw<Array<{ day: Date | string; amountMinor: number | bigint | null; count: number | bigint }>>`
      SELECT date_trunc('day', "occurredAt")::date AS day,
             COALESCE(SUM("amountMinor"), 0)::int AS "amountMinor",
             COUNT(*)::int AS count
      FROM "RevenueLedgerEntry"
      WHERE "occurredAt" >= ${chartStart}
        AND "status" IN ('BILLABLE', 'INVOICED', 'PAID')
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }

  private normaliseDailyRevenue(
    chartStart: Date,
    rows: Array<{ day: Date | string; amountMinor: number | bigint | null; count: number | bigint }>
  ) {
    const byDay = new Map(
      rows.map((row) => [
        this.dateKey(row.day),
        {
          amountMinor: this.toNumber(row.amountMinor),
          count: this.toNumber(row.count)
        }
      ])
    );
    return Array.from({ length: 31 }, (_, index) => {
      const day = new Date(chartStart);
      day.setDate(day.getDate() + index);
      const key = this.dateKey(day);
      const value = byDay.get(key);
      return {
        day: key,
        amountMinor: value?.amountMinor ?? 0,
        count: value?.count ?? 0
      };
    });
  }

  private sumRevenueStatuses(statusBreakdown: Array<{ status: RevenueEntryStatus; amountMinor: number }>, statuses: RevenueEntryStatus[]) {
    const allowed = new Set(statuses);
    return statusBreakdown.filter((entry) => allowed.has(entry.status)).reduce((sum, entry) => sum + entry.amountMinor, 0);
  }

  private dateKey(value: Date | string) {
    return new Date(value).toISOString().slice(0, 10);
  }

  private toNumber(value: number | bigint | null | undefined) {
    if (typeof value === "bigint") return Number(value);
    return value ?? 0;
  }

  private mergeSettingValue<T extends Record<string, unknown>>(defaults: T, value: Prisma.JsonValue | undefined) {
    return {
      ...defaults,
      ...(value && typeof value === "object" && !Array.isArray(value) ? value : {})
    } as T;
  }
}
