import { Injectable } from "@nestjs/common";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/services/prisma.service.js";
import { CredentialSigningService } from "../../platform/services/credential-signing.service.js";

type VerificationContext = {
  ipAddress?: string | null;
  verifierName?: string;
  verifierEmail?: string;
};

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: CredentialSigningService
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
    await this.prisma.$transaction([
      this.prisma.accessGrant.update({
        where: { uuid: accessGrant.uuid },
        data: { viewCount: { increment: 1 } }
      }),
      this.prisma.verificationEvent.create({
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
      })
    ]);

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
        credential
      };
    }

    const cryptographicStatus =
      credential.signature && (await this.signer.verify(this.unsignedPayload(credential.vcPayload), credential.signature))
        ? "VALID"
        : "INVALID";
    await this.prisma.verificationEvent.create({
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

    return {
      outcome: "CONFIRMED",
      cryptographicStatus,
      credential
    };
  }

  async credentialStatus(credId: string, _context: VerificationContext = {}) {
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

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
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
