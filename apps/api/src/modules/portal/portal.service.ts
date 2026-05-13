import { BadRequestException, ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { InstitutionUserStatus, UserRole, type Prisma } from "@prisma/client";
import { createInstitutionApplicationSchema, createPortalUploadUrlSchema } from "@acadid/shared";
import { AuthService } from "../auth/auth.service.js";
import type { AuthTokenPayload } from "../auth/types.js";
import { AuditService } from "../platform/services/audit.service.js";
import { IdempotencyService } from "../platform/services/idempotency.service.js";
import { PrismaService } from "../platform/services/prisma.service.js";

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly audit?: AuditService,
    @Optional()
    private readonly idempotency?: IdempotencyService,
    @Optional()
    private readonly authService?: AuthService
  ) {}

  readMouVersion() {
    return {
      version: process.env.ACADID_MOU_VERSION ?? "2026.1",
      title: "ACAD.ID Institution Authority MOU",
      effectiveFrom: process.env.ACADID_MOU_EFFECTIVE_FROM ?? "2026-05-01",
      templateUrl: process.env.ACADID_MOU_TEMPLATE_URL ?? null,
      acceptanceRequired: true,
      acceptanceField: "mouAccepted",
      checksum: process.env.ACADID_MOU_TEMPLATE_CHECKSUM ?? null
    };
  }

  async issueUploadUrl(auth: AuthTokenPayload, input: unknown) {
    const parsed = createPortalUploadUrlSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const uploadId = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const bucket = this.storageBucket();
    const storageKey = this.buildStorageKey(uploadId, parsed.data.fileName);
    const storageUrl = `storage://${bucket}/${storageKey}`;
    const configuredUploadBaseUrl = process.env.ACADID_PORTAL_UPLOAD_BASE_URL;
    const uploadUrl = configuredUploadBaseUrl ? `${configuredUploadBaseUrl.replace(/\/$/, "")}/${storageKey}` : null;
    const status = uploadUrl ? "ISSUED" : "PROVIDER_CONFIGURATION_REQUIRED";

    await this.audit?.write({
      actorId: auth.kind === "API_KEY" ? undefined : auth.sub,
      actorRole: auth.role,
      actorType: auth.kind === "API_KEY" ? "API_KEY" : "USER",
      clientId: auth.clientId,
      action: "portal.upload_url.issue",
      targetType: "PortalUpload",
      targetId: uploadId,
      outcome: "SUCCESS",
      metadata: {
        purpose: parsed.data.purpose,
        contentType: parsed.data.contentType,
        sizeBytes: parsed.data.sizeBytes,
        checksumProvided: Boolean(parsed.data.checksum),
        storageConfigured: Boolean(uploadUrl),
        productCode: auth.productCode
      }
    });

    return {
      uploadId,
      status,
      method: "PUT",
      uploadUrl,
      storageUrl,
      storageKey,
      expiresAt,
      maxBytes: 15 * 1024 * 1024,
      requiredHeaders: {
        "content-type": parsed.data.contentType
      },
      document: {
        label: this.documentLabel(parsed.data.purpose),
        purpose: parsed.data.purpose,
        fileName: parsed.data.fileName,
        contentType: parsed.data.contentType,
        sizeBytes: parsed.data.sizeBytes,
        checksum: parsed.data.checksum ?? null
      },
      warning: uploadUrl
        ? "Upload URL expires in 15 minutes. Submit the returned storageUrl in documentUploads after upload succeeds."
        : "Storage signing is not configured in this environment. Use storageUrl as a metadata placeholder for sandbox application submission."
    };
  }

  async createInstitutionApplication(auth: AuthTokenPayload, input: unknown, idempotencyKey?: string) {
    if (idempotencyKey && this.idempotency) {
      return this.idempotency.execute({
        scope: "portal:institution_application",
        key: idempotencyKey,
        operation: "portal.institution_application.create",
        request: input,
        auth,
        ttlHours: 72,
        handler: () => this.createInstitutionApplicationRecord(input)
      });
    }
    return this.createInstitutionApplicationRecord(input);
  }

  async listStaff(auth: AuthTokenPayload) {
    const institutionId = this.requireInstitutionStaffManager(auth);
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
      orderBy: [{ status: "asc" }, { role: "asc" }, { createdAt: "desc" }]
    });

    return staff.map((member) => this.safeStaff(member));
  }

  async inviteStaff(auth: AuthTokenPayload, input: unknown) {
    this.requireInstitutionStaffManager(auth);
    if (!this.authService) {
      throw new BadRequestException("Institution staff invitation service is not available.");
    }
    const body = this.parseStaffInput(input, { invite: true });
    if (body.role === UserRole.REGISTRAR) {
      throw new ForbiddenException("Registrar-to-registrar invitation requires founder approval.");
    }

    return this.authService.inviteInstitutionUser(auth, {
      institutionId: auth.institutionUuid,
      email: body.email,
      fullName: body.fullName,
      phone: body.phone,
      role: body.role,
      permissions: body.permissions,
      assignedScopes: body.assignedScopes
    });
  }

  async updateStaff(auth: AuthTokenPayload, staffId: string, input: unknown) {
    const institutionId = this.requireInstitutionStaffManager(auth);
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
    if (!existing || existing.institutionId !== institutionId) {
      throw new BadRequestException("Institution staff member was not found in this workspace.");
    }
    if (existing.role === UserRole.REGISTRAR) {
      throw new ForbiddenException("Registrar membership changes require founder approval.");
    }

    const body = this.parseStaffInput(input, { invite: false });
    const data: Prisma.InstitutionUserUpdateInput = {};
    if (body.role) {
      if (body.role === UserRole.REGISTRAR) {
        throw new ForbiddenException("Registrar role assignment requires founder approval.");
      }
      data.role = body.role;
    }
    if (body.status) {
      data.status = body.status;
      data.suspendedAt = body.status === InstitutionUserStatus.SUSPENDED ? new Date() : null;
    }
    if (body.permissions) {
      data.permissions = body.permissions;
    }
    if (body.assignedScopes) {
      data.assignedScopes = body.assignedScopes as Prisma.InputJsonValue;
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

    await this.audit?.write({
      actorId: auth.sub,
      actorRole: auth.role,
      institutionId,
      action: "portal.institution_user.update",
      targetType: "InstitutionUser",
      targetId: staffId,
      outcome: "SUCCESS",
      metadata: {
        previousStatus: existing.status,
        nextStatus: updated.status,
        previousRole: existing.role,
        nextRole: updated.role,
        permissionsUpdated: Boolean(body.permissions),
        assignedScopesUpdated: Boolean(body.assignedScopes),
        twoFactorRequired: updated.twoFactorRequired
      }
    });

    return this.safeStaff(updated);
  }

  async readStaffScopeOptions(auth: AuthTokenPayload) {
    const institutionId = this.requireInstitutionStaffManager(auth);
    const [sessions, structures] = await Promise.all([
      this.prisma.academicSession.findMany({
        where: { institutionId },
        orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
        take: 25,
        select: {
          uuid: true,
          sessionLabel: true,
          periodType: true,
          periodLabel: true,
          status: true,
          isCurrent: true
        }
      }),
      this.prisma.academicStructure.findMany({
        where: { institutionId, status: "ACTIVE" },
        orderBy: [{ type: "asc" }, { name: "asc" }],
        take: 500,
        select: {
          uuid: true,
          parentId: true,
          type: true,
          name: true,
          code: true,
          creditUnits: true,
          metadata: true
        }
      })
    ]);

    return {
      institution: {
        uuid: auth.institutionUuid,
        institutionId: auth.institutionId,
        officialName: auth.institutionName
      },
      recommendedScopeKeys: ["sessionId", "structureScopeId", "level", "class_arm", "subject", "faculty", "department", "programme", "course_code"],
      sessions,
      structures
    };
  }

  private async createInstitutionApplicationRecord(input: unknown) {
    const parsed = createInstitutionApplicationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existingPendingApplication = await this.prisma.institutionApplication.findFirst({
      where: {
        contactEmail: parsed.data.contactEmail.trim().toLowerCase(),
        status: "PENDING"
      },
      select: { uuid: true }
    });
    if (existingPendingApplication) {
      throw new BadRequestException("An institution application is already pending for this contact email.");
    }

    const application = await this.prisma.institutionApplication.create({
      data: {
        officialName: parsed.data.officialName.trim(),
        type: parsed.data.type,
        state: parsed.data.state.trim(),
        address: parsed.data.address.trim(),
        contactPersonName: parsed.data.contactPersonName.trim(),
        contactEmail: parsed.data.contactEmail.trim().toLowerCase(),
        studentVolume: parsed.data.studentVolume,
        documentUploads: parsed.data.documentUploads,
        mouAcceptedAt: new Date()
      },
      select: {
        uuid: true,
        officialName: true,
        type: true,
        status: true,
        createdAt: true
      }
    });

    return {
      accepted: true,
      applicationId: application.uuid,
      status: application.status,
      institutionName: application.officialName,
      institutionType: application.type,
      submittedAt: application.createdAt
    };
  }

  private buildStorageKey(uploadId: string, fileName: string) {
    const safeName = fileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
    const today = new Date().toISOString().slice(0, 10);
    return `portal-applications/${today}/${uploadId}-${safeName || "document"}`;
  }

  private storageBucket() {
    return (
      process.env.SUPABASE_STORAGE_BUCKET ??
      process.env.OBJECT_STORAGE_BUCKET ??
      process.env.STORAGE_BUCKET ??
      "acadid-portal-intake"
    );
  }

  private documentLabel(purpose: string) {
    return purpose
      .split("_")
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
  }

  private requireInstitutionStaffManager(auth: AuthTokenPayload) {
    if (auth.kind === "API_KEY") {
      throw new ForbiddenException("Human institution session is required to manage staff.");
    }
    if (!auth.institutionUuid) {
      throw new ForbiddenException("Institution-scoped session is required.");
    }
    const permissions = new Set(auth.permissions ?? []);
    if (auth.role !== UserRole.REGISTRAR && !permissions.has("staff:manage") && !permissions.has("*")) {
      throw new ForbiddenException("staff:manage permission is required.");
    }
    return auth.institutionUuid;
  }

  private parseStaffInput(input: unknown, options: { invite: boolean }) {
    const body = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
    return {
      email: options.invite ? this.requiredString(body.email, "email").toLowerCase() : this.optionalString(body.email),
      fullName: options.invite ? this.requiredString(body.fullName, "fullName") : this.optionalString(body.fullName),
      phone: this.optionalString(body.phone),
      role: typeof body.role === "string" ? this.parseRole(body.role) : undefined,
      status: typeof body.status === "string" ? this.parseStatus(body.status) : undefined,
      permissions: Array.isArray(body.permissions) ? this.parseStringArray(body.permissions, "permissions", 30) : undefined,
      assignedScopes: Array.isArray(body.assignedScopes) ? this.parseAssignedScopes(body.assignedScopes) : undefined,
      twoFactorRequired: typeof body.twoFactorRequired === "boolean" ? body.twoFactorRequired : undefined
    };
  }

  private parseRole(role: string) {
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

  private parseStatus(status: string) {
    const normalized = status.trim().toUpperCase();
    const allowed = new Set<InstitutionUserStatus>([InstitutionUserStatus.INVITED, InstitutionUserStatus.ACTIVE, InstitutionUserStatus.SUSPENDED, InstitutionUserStatus.DISABLED]);
    if (!allowed.has(normalized as InstitutionUserStatus)) {
      throw new BadRequestException("Staff status is invalid.");
    }
    return normalized as InstitutionUserStatus;
  }

  private parseStringArray(value: unknown[], field: string, maxItems: number) {
    if (value.length > maxItems) {
      throw new BadRequestException(`${field} cannot contain more than ${maxItems} entries.`);
    }
    return value.map((item) => {
      if (typeof item !== "string" || !item.trim()) {
        throw new BadRequestException(`${field} must contain non-empty strings.`);
      }
      return item.trim();
    });
  }

  private parseAssignedScopes(value: unknown[]) {
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
      if (!entries.length) {
        throw new BadRequestException("Assigned scope objects cannot be empty.");
      }
      return Object.fromEntries(entries);
    });
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`${field} is required.`);
    }
    return value.trim();
  }

  private optionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private safeStaff(
    member: Prisma.InstitutionUserGetPayload<{
      include: {
        user: { select: { uuid: true; email: true; fullName: true; phone: true; mfaEnabled: true } };
        invitedBy: { select: { uuid: true; email: true; fullName: true } };
        institution: { select: { uuid: true; institutionId: true; officialName: true } };
      };
    }>
  ) {
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
}
