import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/services/prisma.service.js";

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyToken(token: string) {
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
      await this.recordVerification(accessGrant.credentialId, accessGrant.uuid, "DENIED", {});
      return { outcome: "DENIED", reason: deniedReason };
    }

    const credential = accessGrant.credential;
    if (credential.status !== "ACTIVE") {
      await this.recordVerification(credential.uuid, accessGrant.uuid, "REVOKED", {});
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
          verifierName: accessGrant.recipientLabel,
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

  async verifyReference(refnum: string) {
    const credential = await this.prisma.credential.findUnique({
      where: { credentialRef: refnum },
      select: {
        credentialRef: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        revocationReason: true,
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
      return {
        outcome: "REVOKED",
        credential
      };
    }

    return {
      outcome: "CONFIRMED",
      credential
    };
  }

  async credentialStatus(credId: string) {
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
    accessGrantId: string,
    outcome: "DENIED" | "REVOKED",
    scopeViewed: Prisma.InputJsonValue
  ) {
    await this.prisma.verificationEvent.create({
      data: {
        credentialId,
        accessGrantId,
        verifierType: "SHARE_LINK",
        outcome,
        scopeViewed
      }
    });
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
