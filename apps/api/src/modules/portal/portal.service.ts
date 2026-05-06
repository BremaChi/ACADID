import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createInstitutionApplicationSchema, createPortalUploadUrlSchema } from "@acadid/shared";
import type { AuthTokenPayload } from "../auth/types.js";
import { AuditService } from "../platform/services/audit.service.js";
import { PrismaService } from "../platform/services/prisma.service.js";

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit?: AuditService
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
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? process.env.STORAGE_BUCKET ?? "acadid-portal-intake";
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

  async createInstitutionApplication(input: unknown) {
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

  private documentLabel(purpose: string) {
    return purpose
      .split("_")
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
  }
}
