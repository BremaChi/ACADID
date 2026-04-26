import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/services/prisma.service.js";

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  verifyToken(token: string) {
    return {
      token,
      next: "Hash token, find Access Grant, enforce scope/expiry/revocation, create Verification Event."
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
}
