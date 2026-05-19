import { BadRequestException, Injectable } from "@nestjs/common";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/services/prisma.service.js";
import { CredentialSigningService } from "../../platform/services/credential-signing.service.js";
import { CacheService } from "../../platform/services/cache.service.js";

type VerificationContext = {
  ipAddress?: string | null;
  verifierName?: string;
  verifierEmail?: string;
};

type BulkVerificationBody = {
  credentialRefs?: unknown;
  references?: unknown;
  refnums?: unknown;
  ains?: unknown;
  ain?: unknown;
};

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: CredentialSigningService,
    private readonly cache?: CacheService
  ) {}

  async verifyToken(token: string, context: VerificationContext = {}) {
    const accessGrant = await this.prisma.accessGrant.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: {
        credential: {
          include: {
            learner: true,
            institution: true
          }
        }
      }
    });

    if (!accessGrant) {
      return { outcome: "DENIED", reason: "Verification link not found." };
    }

    const deniedReason = this.deniedReason(accessGrant);
    if (deniedReason) {
      await this.recordVerification(accessGrant.credentialId, accessGrant.uuid, "DENIED", {}, "SHARE_LINK", context);
      return { outcome: "DENIED", reason: deniedReason };
    }

    const credential = accessGrant.credential;
    if (credential.status !== "ACTIVE") {
      await this.recordVerification(credential.uuid, accessGrant.uuid, "REVOKED", {}, "SHARE_LINK", context);
      return { outcome: credential.status === "REVOKED" ? "REVOKED" : "DENIED", reason: credential.status };
    }

    const scopeViewed = this.scopeCredential(accessGrant.scope, credential);
    await this.prisma.$transaction(async (tx) => {
      await tx.accessGrant.update({
        where: { uuid: accessGrant.uuid },
        data: { viewCount: { increment: 1 } }
      });
      const verificationEvent = await tx.verificationEvent.create({
        data: {
          credentialId: credential.uuid,
          accessGrantId: accessGrant.uuid,
          verifierType: "SHARE_LINK",
          verifierName: context.verifierName ?? accessGrant.recipientLabel,
          verifierEmailEncrypted: this.encryptOptional(context.verifierEmail),
          ipAddressHash: this.hashOptional(context.ipAddress),
          outcome: "CONFIRMED",
          scopeViewed: scopeViewed as Prisma.InputJsonValue
        }
      });
      await this.recordVerificationRevenue(tx, {
        verificationEventId: verificationEvent.uuid,
        credentialId: credential.uuid,
        institutionId: credential.institutionId,
        description: "Share-link credential verification fee"
      });
    });

    return {
      outcome: "CONFIRMED",
      credential: scopeViewed
    };
  }

  async verifyReference(refnum: string, context: VerificationContext = {}) {
    const credential = await this.prisma.credential.findUnique({
      where: { credentialRef: refnum },
      select: {
        uuid: true,
        credentialRef: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        revocationReason: true,
        signature: true,
        vcPayload: true,
        institution: {
          select: {
            uuid: true,
            institutionId: true,
            officialName: true
          }
        }
      }
    });

    if (!credential) {
      return { outcome: "DENIED", reason: "Credential reference not found." };
    }

    if (credential.status === "REVOKED") {
      await this.recordVerification(credential.uuid, undefined, "REVOKED", { credentialRef: credential.credentialRef }, "CREDENTIAL_REFERENCE", context);
      return {
        outcome: "REVOKED",
        credential: this.publicReferenceCredential(credential)
      };
    }

    const cryptographicStatus =
      credential.signature && (await this.signer.verify(this.unsignedPayload(credential.vcPayload), credential.signature))
        ? "VALID"
        : "INVALID";
    const verificationEvent = await this.prisma.verificationEvent.create({
      data: {
        credentialId: credential.uuid,
        verifierType: "CREDENTIAL_REFERENCE",
        verifierName: context.verifierName,
        verifierEmailEncrypted: this.encryptOptional(context.verifierEmail),
        ipAddressHash: this.hashOptional(context.ipAddress),
        outcome: cryptographicStatus === "VALID" ? "CONFIRMED" : "DISCREPANCY",
        scopeViewed: {
          credentialRef: credential.credentialRef,
          cryptographicStatus
        }
      }
    });
    if (cryptographicStatus === "VALID") {
      await this.recordVerificationRevenue(this.prisma, {
        verificationEventId: verificationEvent.uuid,
        credentialId: credential.uuid,
        institutionId: credential.institution.uuid,
        description: "Credential reference verification fee"
      });
    }

    return {
      outcome: "CONFIRMED",
      cryptographicStatus,
      credential: this.publicReferenceCredential(credential)
    };
  }

  async credentialStatus(credId: string, _context: VerificationContext = {}) {
    if (this.cache) {
      return this.cache.getOrSet(`credential-status:${credId}`, () => this.readCredentialStatus(credId), {
        ttlSeconds: 30,
        tags: ["credential-status", `credential:${credId}`]
      });
    }
    return this.readCredentialStatus(credId);
  }

  async bulkVerify(body: unknown, context: VerificationContext = {}) {
    const payload = this.bulkPayload(body);
    const credentialRefs = this.normalizeList(payload.credentialRefs ?? payload.references ?? payload.refnums, 50);
    const ains = this.normalizeList(payload.ains ?? payload.ain, 50);
    const total = credentialRefs.length + ains.length;

    if (total === 0) {
      throw new BadRequestException("Provide at least one credentialRefs or ains value.");
    }
    if (total > 50) {
      throw new BadRequestException("Bulk verification accepts a maximum of 50 identifiers per request.");
    }

    const [credentials, learnerLookups] = await Promise.all([
      Promise.all(credentialRefs.map(async (credentialRef) => ({ credentialRef, result: await this.verifyReference(credentialRef, context) }))),
      Promise.all(ains.map(async (ain) => ({ ain, result: await this.lookupAin(ain, context) })))
    ]);
    const flatResults = [...credentials.map((item) => item.result), ...learnerLookups.map((item) => item.result)];

    return {
      outcome: "COMPLETED",
      total,
      confirmed: flatResults.filter((result) => result.outcome === "CONFIRMED").length,
      revoked: flatResults.filter((result) => result.outcome === "REVOKED").length,
      denied: flatResults.filter((result) => result.outcome === "DENIED").length,
      credentials,
      learnerLookups
    };
  }

  async lookupAin(ain: string, context: VerificationContext = {}) {
    const normalizedAin = this.normalizeIdentifier(ain);
    if (!normalizedAin) {
      throw new BadRequestException("AIN is required.");
    }

    const [learner, activeCredentialCount] = await Promise.all([
      this.prisma.learner.findUnique({
        where: { ain: normalizedAin },
        select: {
          uuid: true,
          ain: true,
          fullName: true,
          identityStatus: true,
          credentials: {
            orderBy: { issuedAt: "desc" },
            take: 10,
            select: {
              uuid: true,
              credentialRef: true,
              type: true,
              status: true,
              issuedAt: true,
              institution: {
                select: {
                  institutionId: true,
                  officialName: true
                }
              }
            }
          }
        }
      }),
      this.prisma.credential.count({
        where: {
          learner: { ain: normalizedAin },
          status: "ACTIVE"
        }
      })
    ]);

    if (!learner) {
      return { outcome: "DENIED", reason: "AIN not found." };
    }

    const visibleCredentials = learner.credentials.map(({ uuid: _uuid, ...credential }) => credential);
    const scopeViewed = {
      ain: learner.ain,
      activeCredentialCount,
      credentialRefs: visibleCredentials.map((credential) => credential.credentialRef)
    };
    const eventCredential = learner.credentials.find((credential) => credential.status === "ACTIVE") ?? learner.credentials[0];
    if (eventCredential) {
      await this.prisma.verificationEvent.create({
        data: {
          credentialId: eventCredential.uuid,
          verifierType: "AIN_LOOKUP",
          verifierName: context.verifierName,
          verifierEmailEncrypted: this.encryptOptional(context.verifierEmail),
          ipAddressHash: this.hashOptional(context.ipAddress),
          outcome: activeCredentialCount > 0 ? "CONFIRMED" : "DENIED",
          scopeViewed
        }
      });
    }

    return {
      outcome: "CONFIRMED",
      learner: {
        ain: learner.ain,
        fullName: learner.fullName,
        identityStatus: learner.identityStatus
      },
      credentialSummary: {
        activeCredentialCount,
        returnedCredentialCount: visibleCredentials.length,
        credentials: visibleCredentials
      }
    };
  }

  private async readCredentialStatus(credId: string) {
    const credential = await this.prisma.credential.findUnique({
      where: { credentialRef: credId },
      select: {
        credentialRef: true,
        status: true,
        revokedAt: true,
        revocationReason: true
      }
    });

    return credential ?? { outcome: "DENIED", reason: "Credential not found." };
  }

  private publicReferenceCredential(credential: {
    credentialRef: string;
    status: string;
    issuedAt: Date;
    revokedAt: Date | null;
    revocationReason: string | null;
    signature: string | null;
    vcPayload: Prisma.JsonValue;
    institution: {
      institutionId: string;
      officialName: string;
    };
  }) {
    return {
      credentialRef: credential.credentialRef,
      status: credential.status,
      issuedAt: credential.issuedAt,
      revokedAt: credential.revokedAt,
      revocationReason: credential.revocationReason,
      signature: credential.signature,
      vcPayload: credential.vcPayload,
      institution: {
        institutionId: credential.institution.institutionId,
        officialName: credential.institution.officialName
      }
    };
  }

  private deniedReason(accessGrant: {
    revokedAt: Date | null;
    expiresAt: Date | null;
    maxViews: number | null;
    viewCount: number;
  }): string | null {
    if (accessGrant.revokedAt) {
      return "Verification link has been revoked.";
    }
    if (accessGrant.expiresAt && accessGrant.expiresAt <= new Date()) {
      return "Verification link has expired.";
    }
    if (accessGrant.maxViews !== null && accessGrant.viewCount >= accessGrant.maxViews) {
      return "Verification link view limit has been reached.";
    }

    return null;
  }

  private scopeCredential(scope: string, credential: Prisma.CredentialGetPayload<{ include: { learner: true; institution: true } }>) {
    const base = {
      credentialRef: credential.credentialRef,
      type: credential.type,
      status: credential.status,
      issuedAt: credential.issuedAt,
      institution: {
        institutionId: credential.institution.institutionId,
        officialName: credential.institution.officialName
      },
      learner: {
        ain: credential.learner.ain,
        fullName: credential.learner.fullName
      }
    };

    if (scope === "FULL") {
      return {
        ...base,
        vcPayload: credential.vcPayload
      };
    }

    return {
      ...base,
      scope,
      credentialSummary: credential.scope
    };
  }

  private async recordVerification(
    credentialId: string,
    accessGrantId: string | undefined,
    outcome: "DENIED" | "REVOKED",
    scopeViewed: Prisma.InputJsonValue,
    verifierType: string,
    context: VerificationContext
  ) {
    await this.prisma.verificationEvent.create({
      data: {
        credentialId,
        accessGrantId,
        verifierType,
        verifierName: context.verifierName,
        verifierEmailEncrypted: this.encryptOptional(context.verifierEmail),
        ipAddressHash: this.hashOptional(context.ipAddress),
        outcome,
        scopeViewed
      }
    });
  }

  private async recordVerificationRevenue(
    client: Pick<PrismaService, "revenueLedgerEntry"> | Prisma.TransactionClient,
    input: {
      verificationEventId: string;
      credentialId: string;
      institutionId?: string;
      description: string;
    }
  ) {
    const amountMinor = this.verificationFeeMinor();
    if (amountMinor <= 0) {
      return;
    }

    await client.revenueLedgerEntry.create({
      data: {
        category: "VERIFICATION_FEE",
        status: "BILLABLE",
        amountMinor,
        currency: "NGN",
        institutionId: input.institutionId,
        credentialId: input.credentialId,
        verificationEventId: input.verificationEventId,
        sourceType: "VerificationEvent",
        sourceId: input.verificationEventId,
        description: input.description,
        metadata: {
          configuredBy: "ACADID_VERIFICATION_FEE_MINOR"
        }
      }
    });
  }

  private verificationFeeMinor() {
    const raw = process.env.ACADID_VERIFICATION_FEE_MINOR;
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private bulkPayload(body: unknown): BulkVerificationBody {
    return body && typeof body === "object" && !Array.isArray(body) ? (body as BulkVerificationBody) : {};
  }

  private normalizeList(value: unknown, limit: number): string[] {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    const unique = new Set<string>();
    for (const item of values) {
      const normalized = this.normalizeIdentifier(String(item));
      if (normalized) {
        unique.add(normalized);
      }
      if (unique.size > limit) {
        break;
      }
    }
    return [...unique];
  }

  private normalizeIdentifier(value: string | undefined): string {
    return value?.trim().slice(0, 120) ?? "";
  }

  private hashOptional(value: string | null | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized ? createHash("sha256").update(normalized).digest("hex") : undefined;
  }

  private encryptOptional(value: string | undefined): string | undefined {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
  }

  private encryptionKey(): Buffer {
    const source = process.env.VERIFICATION_EVENT_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? "local-development-secret-change-before-pilot";
    return createHash("sha256").update(source).digest();
  }

  private unsignedPayload(payload: Prisma.JsonValue): unknown {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return payload;
    }

    const { proof: _proof, ...unsigned } = payload as Record<string, unknown>;
    return unsigned;
  }
}
