import { Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../platform/services/prisma.service.js";
import { AuditService } from "../platform/services/audit.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";
import { TotpService } from "./totp.service.js";
import type { AuthTokenPayload } from "./types.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly totpService: TotpService,
    private readonly audit: AuditService
  ) {}

  async login(email: string, password: string, totpCode?: string, recoveryCode?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        uuid: true,
        email: true,
        fullName: true,
        role: true,
        learnerId: true,
        passwordHash: true,
        mfaEnabled: true,
        totpSecretEncrypted: true
      }
    });

    if (!user || !this.passwordService.verify(password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    if (user.mfaEnabled) {
      if (!user.totpSecretEncrypted) {
        throw new UnauthorizedException("Authenticator code is required.");
      }

      const verifiedTotp = totpCode ? this.totpService.verifyCode(this.totpService.decryptSecret(user.totpSecretEncrypted), totpCode) : false;
      const consumedRecoveryCode = verifiedTotp ? false : await this.consumeRecoveryCode(user.uuid, recoveryCode);
      if (!verifiedTotp && !consumedRecoveryCode) {
        throw new UnauthorizedException("Invalid authenticator code.");
      }
    }

    const accessToken = this.tokenService.sign({
      sub: user.uuid,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      learnerId: user.learnerId ?? undefined
    });

    return {
      accessToken,
      tokenType: "Bearer",
      user: {
        uuid: user.uuid,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        learnerId: user.learnerId,
        mfaEnabled: user.mfaEnabled
      }
    };
  }

  async setupTotp(auth: AuthTokenPayload) {
    if (auth.kind === "API_KEY" || auth.role !== UserRole.ACADID_SUPER_ADMIN) {
      throw new UnauthorizedException("Only the AcadID founder admin can configure founder MFA.");
    }

    const user = await this.prisma.user.findUnique({
      where: { uuid: auth.sub },
      select: { uuid: true, email: true, mfaEnabled: true }
    });
    if (!user) {
      throw new UnauthorizedException("User not found.");
    }

    const secret = this.totpService.createSecret();
    await this.prisma.user.update({
      where: { uuid: user.uuid },
      data: {
        totpSecretEncrypted: this.totpService.encryptSecret(secret),
        mfaEnabled: false,
        totpEnabledAt: null
      }
    });

    return {
      secret,
      otpauthUrl: this.totpService.createOtpAuthUrl({ secret, accountName: user.email }),
      mfaEnabled: false
    };
  }

  async enableTotp(auth: AuthTokenPayload, code: string) {
    if (auth.kind === "API_KEY" || auth.role !== UserRole.ACADID_SUPER_ADMIN) {
      throw new UnauthorizedException("Only the AcadID founder admin can configure founder MFA.");
    }

    const user = await this.prisma.user.findUnique({
      where: { uuid: auth.sub },
      select: { uuid: true, totpSecretEncrypted: true }
    });
    if (!user?.totpSecretEncrypted) {
      throw new UnauthorizedException("TOTP setup has not been started.");
    }

    const secret = this.totpService.decryptSecret(user.totpSecretEncrypted);
    if (!this.totpService.verifyCode(secret, code)) {
      throw new UnauthorizedException("Invalid authenticator code.");
    }

    await this.prisma.user.update({
      where: { uuid: user.uuid },
      data: {
        mfaEnabled: true,
        totpEnabledAt: new Date()
      }
    });

    return {
      ok: true,
      mfaEnabled: true
    };
  }

  async recoveryCodeStatus(auth: AuthTokenPayload) {
    await this.assertFounderAuth(auth);
    const [remaining, latest] = await Promise.all([
      this.prisma.mfaRecoveryCode.count({
        where: {
          userId: auth.sub,
          usedAt: null
        }
      }),
      this.prisma.mfaRecoveryCode.findFirst({
        where: { userId: auth.sub },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
      })
    ]);

    return {
      remaining,
      generatedAt: latest?.createdAt ?? null
    };
  }

  async rotateRecoveryCodes(auth: AuthTokenPayload, code?: string) {
    await this.assertFounderAuth(auth);
    const user = await this.prisma.user.findUnique({
      where: { uuid: auth.sub },
      select: {
        uuid: true,
        mfaEnabled: true,
        totpSecretEncrypted: true
      }
    });
    if (!user?.mfaEnabled || !user.totpSecretEncrypted) {
      throw new UnauthorizedException("Enable founder TOTP before generating recovery codes.");
    }
    if (!code || !this.totpService.verifyCode(this.totpService.decryptSecret(user.totpSecretEncrypted), code)) {
      throw new UnauthorizedException("Valid authenticator code is required to rotate recovery codes.");
    }

    const recoveryCodes = Array.from({ length: 10 }, () => this.createRecoveryCode());
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.uuid } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          userId: user.uuid,
          codeHash: this.passwordService.hash(this.normalizeRecoveryCode(recoveryCode))
        }))
      })
    ]);

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "founder_mfa.recovery_codes.rotate",
      targetType: "User",
      targetId: auth.sub,
      outcome: "SUCCESS",
      metadata: {
        count: recoveryCodes.length
      }
    });

    return {
      recoveryCodes,
      warning: "Save these recovery codes now. AcadID stores only hashed one-time versions and cannot show them again."
    };
  }

  async issueApiToken(input: { client_id?: string; clientId?: string; client_secret?: string; clientSecret?: string }) {
    const clientId = input.client_id ?? input.clientId;
    const clientSecret = input.client_secret ?? input.clientSecret;
    if (!clientId || !clientSecret) {
      throw new UnauthorizedException("client_id and client_secret are required.");
    }

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { clientId },
      include: {
        institution: {
          select: {
            uuid: true,
            institutionId: true,
            officialName: true,
            status: true
          }
        }
      }
    });

    const now = new Date();
    if (
      !apiKey ||
      !this.passwordService.verify(clientSecret, apiKey.clientSecretHash) ||
      apiKey.status !== "ACTIVE" ||
      (apiKey.ownerType === "INSTITUTION" && apiKey.institution?.status !== "ACTIVE") ||
      (apiKey.expiresAt && apiKey.expiresAt <= now)
    ) {
      throw new UnauthorizedException("Invalid API credentials.");
    }

    await this.prisma.apiKey.update({
      where: { uuid: apiKey.uuid },
      data: { lastUsedAt: now }
    });

    const accessToken = this.tokenService.signApiClient({
      sub: apiKey.uuid,
      email: `${apiKey.clientId}@api-key.acadid.local`,
      fullName: apiKey.label,
      role: UserRole.REGISTRAR,
      kind: "API_KEY",
      institutionId: apiKey.institution?.institutionId,
      institutionUuid: apiKey.institution?.uuid,
      apiKeyId: apiKey.uuid,
      apiKeyOwnerType: apiKey.ownerType,
      productCode: apiKey.productCode ?? undefined,
      productName: apiKey.productName ?? undefined,
      scopes: apiKey.scopes,
      environment: apiKey.environment,
      rateLimitPerMinute: apiKey.rateLimitPerMinute
    });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: apiKey.environment === "PRODUCTION" ? 3600 : 86400,
      apiClient: {
        clientId: apiKey.clientId,
        label: apiKey.label,
        ownerType: apiKey.ownerType,
        productCode: apiKey.productCode,
        productName: apiKey.productName,
        institutionId: apiKey.institution?.institutionId ?? null,
        institutionName: apiKey.institution?.officialName ?? null,
        scopes: apiKey.scopes,
        environment: apiKey.environment,
        rateLimitPerMinute: apiKey.rateLimitPerMinute
      }
    };
  }

  private async assertFounderAuth(auth: AuthTokenPayload) {
    if (auth.kind === "API_KEY" || auth.role !== UserRole.ACADID_SUPER_ADMIN) {
      throw new UnauthorizedException("Only the AcadID founder admin can manage founder MFA.");
    }
  }

  private async consumeRecoveryCode(userId: string, recoveryCode?: string) {
    const normalized = this.normalizeRecoveryCode(recoveryCode);
    if (!normalized) return false;

    const candidates = await this.prisma.mfaRecoveryCode.findMany({
      where: {
        userId,
        usedAt: null
      },
      select: {
        uuid: true,
        codeHash: true
      },
      take: 20
    });

    const matched = candidates.find((candidate) => this.passwordService.verify(normalized, candidate.codeHash));
    if (!matched) {
      return false;
    }

    await this.prisma.mfaRecoveryCode.updateMany({
      where: {
        uuid: matched.uuid,
        usedAt: null
      },
      data: {
        usedAt: new Date()
      }
    });

    await this.audit.write({
      actorId: userId,
      actorRole: UserRole.ACADID_SUPER_ADMIN,
      action: "founder_mfa.recovery_code.consume",
      targetType: "User",
      targetId: userId,
      outcome: "SUCCESS"
    });

    return true;
  }

  private createRecoveryCode() {
    const value = randomBytes(10).toString("base64url").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12);
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
  }

  private normalizeRecoveryCode(code?: string) {
    return code?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  }
}
