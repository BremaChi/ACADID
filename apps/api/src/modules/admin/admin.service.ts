import { BadRequestException, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { ApiKeyEnvironment, DeveloperAccessRequestStatus, DisputeStatus, Prisma, RevenueCategory, RevenueEntryStatus, VerificationOutcome } from "@prisma/client";
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
  sendDisputeNoticeSchema
} from "@acadid/shared";
import type { AuthTokenPayload } from "../auth/types.js";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../platform/services/prisma.service.js";
import { AuditService } from "../platform/services/audit.service.js";
import { CredentialSigningService } from "../platform/services/credential-signing.service.js";

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
    private readonly credentialSigning?: CredentialSigningService
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

    return institution;
  }

  listInstitutions() {
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

    return institution;
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

    const institution = await this.prisma.$transaction(async (tx) => {
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

      return createdInstitution;
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
        applicationType: application.type
      }
    });

    return {
      accepted: true,
      applicationId: id,
      institution
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

  async readSystemHealth() {
    const generatedAt = new Date();
    const [database, auth, storage, email, webhook, signing, metrics] = await Promise.all([
      this.checkDatabase(),
      this.checkAuthService(),
      this.checkConfiguredService("Storage Service", Boolean(process.env.SUPABASE_STORAGE_BUCKET || process.env.STORAGE_BUCKET)),
      this.checkConfiguredService("Email Service", Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY)),
      this.checkWebhookDelivery(),
      this.checkCredentialSigning(),
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
      webhook,
      signing
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

    return this.readPlatformSettings();
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

  private async checkWebhookDelivery() {
    const startedAt = Date.now();
    try {
      const failedWebhookEvents = await this.prisma.auditEvent.count({
        where: {
          targetType: "WebhookDelivery",
          outcome: { not: "SUCCESS" },
          createdAt: { gte: this.hoursAgo(24) }
        }
      });
      return {
        name: "Webhook Delivery",
        status: failedWebhookEvents > 0 ? ("DEGRADED" as HealthStatus) : ("OPERATIONAL" as HealthStatus),
        responseTimeMs: Date.now() - startedAt,
        message: failedWebhookEvents > 0 ? `${failedWebhookEvents} failed webhook event(s) in the last 24 hours.` : "No webhook delivery failures recorded in the last 24 hours."
      };
    } catch (error) {
      return {
        name: "Webhook Delivery",
        status: "DEGRADED" as HealthStatus,
        responseTimeMs: Date.now() - startedAt,
        message: this.safeErrorMessage(error, "Webhook delivery check failed.")
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

  private async readGatewayMetrics() {
    const startedAt = Date.now();
    const since = this.hoursAgo(24);
    try {
      const [verificationEventsToday, deniedVerificationEvents, revokedVerificationEvents, discrepancyEvents, auditEventsToday, failedAuditEvents, publishedCredentialsToday] =
        await Promise.all([
          this.prisma.verificationEvent.count({ where: { verifiedAt: { gte: since } } }),
          this.prisma.verificationEvent.count({ where: { verifiedAt: { gte: since }, outcome: "DENIED" } }),
          this.prisma.verificationEvent.count({ where: { verifiedAt: { gte: since }, outcome: "REVOKED" } }),
          this.prisma.verificationEvent.count({ where: { verifiedAt: { gte: since }, outcome: "DISCREPANCY" } }),
          this.prisma.auditEvent.count({ where: { createdAt: { gte: since } } }),
          this.prisma.auditEvent.count({ where: { createdAt: { gte: since }, outcome: { not: "SUCCESS" } } }),
          this.prisma.credential.count({ where: { issuedAt: { gte: since } } })
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
        errorRate: 0,
        message: this.safeErrorMessage(error, "Gateway metrics query failed.")
      };
    }
  }

  private deriveIncidents(
    services: Array<{ name: string; status: HealthStatus; message: string }>,
    metrics: { status: HealthStatus; failedAuditEvents: number; deniedVerificationEvents: number; revokedVerificationEvents: number; discrepancyEvents: number; message?: string }
  ) {
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

    return incidents.slice(0, 10);
  }

  private safeErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }

  private hoursAgo(hours: number) {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
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
