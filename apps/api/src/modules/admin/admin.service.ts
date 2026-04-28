import { BadRequestException, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { ApiKeyEnvironment, Prisma } from "@prisma/client";
import { createAuthorityGrantSchema, createInstitutionSchema } from "@acadid/shared";
import type { AuthTokenPayload } from "../auth/types.js";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../platform/services/prisma.service.js";
import { AuditService } from "../platform/services/audit.service.js";

const allowedApiKeyScopes = new Set([
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

  async createApiKey(auth: AuthTokenPayload, institutionId: string, input: unknown) {
    const parsed = this.parseApiKeyInput(input);
    const institution = await this.prisma.institution.findUnique({
      where: { uuid: institutionId },
      select: { uuid: true, institutionId: true, officialName: true }
    });
    if (!institution) {
      throw new BadRequestException("Institution not found.");
    }

    const clientId = this.createClientId(parsed.environment);
    const clientSecret = this.createClientSecret(parsed.environment);
    const apiKey = await this.prisma.apiKey.create({
      data: {
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
      institutionUuid: key.institution.uuid,
      institutionDisplayId: key.institution.institutionId,
      institutionName: key.institution.officialName,
      institutionStatus: key.institution.status
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
      institutionId: apiKey.institutionId,
      outcome: "SUCCESS",
      reason
    });

    return apiKey;
  }

  private async nextInstitutionDisplayId(): Promise<string> {
    const count = await this.prisma.institution.count();
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
      institutionId: true,
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
}
