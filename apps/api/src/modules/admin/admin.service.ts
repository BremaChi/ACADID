import { BadRequestException, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { ApiKeyEnvironment, DeveloperAccessRequestStatus, DisputeStatus, Prisma, VerificationOutcome } from "@prisma/client";
import {
  assignDisputeSchema,
  closeDisputeSchema,
  createAuthorityGrantSchema,
  createDeveloperAccessRequestSchema,
  createDisputeSchema,
  createInstitutionSchema,
  escalateDisputeSchema,
  reviewDeveloperAccessRequestSchema,
  sendDisputeNoticeSchema
} from "@acadid/shared";
import type { AuthTokenPayload } from "../auth/types.js";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../platform/services/prisma.service.js";
import { AuditService } from "../platform/services/audit.service.js";

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

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwordService: PasswordService
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
}
