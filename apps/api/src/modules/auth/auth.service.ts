import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { InstitutionUserStatus, UserRole } from "@prisma/client";
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
        phone: true,
        role: true,
        learnerId: true,
        passwordHash: true,
        mfaEnabled: true,
        totpSecretEncrypted: true,
        institutions: {
          where: {
            status: {
              in: ["ACTIVE", "INVITED", "SUSPENDED"]
            }
          },
          orderBy: { createdAt: "asc" },
          select: {
            uuid: true,
            role: true,
            status: true,
            permissions: true,
            institution: {
              select: {
                uuid: true,
                institutionId: true,
                officialName: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!user || !this.passwordService.verify(password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    let mfaMethod = "NONE";
    if (user.mfaEnabled) {
      if (!user.totpSecretEncrypted) {
        throw new UnauthorizedException("Authenticator code is required.");
      }

      const verifiedTotp = totpCode ? this.totpService.verifyCode(this.totpService.decryptSecret(user.totpSecretEncrypted), totpCode) : false;
      const consumedRecoveryCode = verifiedTotp ? false : await this.consumeRecoveryCode(user.uuid, recoveryCode);
      if (!verifiedTotp && !consumedRecoveryCode) {
        throw new UnauthorizedException("Invalid authenticator code.");
      }
      mfaMethod = verifiedTotp ? "TOTP" : "RECOVERY_CODE";
    }

    const membership = (user.institutions ?? []).find((candidate) => candidate.status === "ACTIVE" && candidate.institution.status === "ACTIVE");
    const invitedMembership = (user.institutions ?? []).find((candidate) => candidate.status === "INVITED");
    if (user.role !== UserRole.ACADID_SUPER_ADMIN && !membership) {
      if (invitedMembership) {
        throw new UnauthorizedException("Invitation has not been accepted yet.");
      }
      throw new UnauthorizedException("No active institution workspace is available for this user.");
    }

    const effectiveRole = membership?.role ?? user.role;
    const permissions = membership?.permissions?.length ? membership.permissions : this.defaultPermissionsForRole(effectiveRole);
    const accessToken = this.tokenService.sign({
      sub: user.uuid,
      email: user.email,
      role: effectiveRole,
      fullName: user.fullName,
      learnerId: user.learnerId ?? undefined,
      institutionUuid: membership?.institution.uuid,
      institutionId: membership?.institution.institutionId,
      institutionName: membership?.institution.officialName,
      institutionUserId: membership?.uuid,
      permissions,
      sessionId: randomUUID()
    });

    if (membership) {
      await this.prisma.institutionUser.update({
        where: { uuid: membership.uuid },
        data: { lastLoginAt: new Date() }
      });
    }

    await this.audit.write({
      actorId: user.uuid,
      actorRole: effectiveRole,
      institutionId: membership?.institution.uuid,
      action: "auth.login",
      targetType: "User",
      targetId: user.uuid,
      outcome: "SUCCESS",
      metadata: {
        mfaMethod
      }
    });

    return {
      accessToken,
      tokenType: "Bearer",
      user: {
        uuid: user.uuid,
        email: user.email,
        fullName: user.fullName,
        role: effectiveRole,
        learnerId: user.learnerId,
        mfaEnabled: user.mfaEnabled,
        institution: membership
          ? {
              uuid: membership.institution.uuid,
              institutionId: membership.institution.institutionId,
              officialName: membership.institution.officialName,
              role: membership.role,
              permissions,
              membershipId: membership.uuid
            }
          : null
      }
    };
  }

  async inviteInstitutionUser(
    auth: AuthTokenPayload,
    input: { institutionId?: string; email?: string; fullName?: string; phone?: string; role?: string; permissions?: string[] }
  ) {
    if (auth.kind === "API_KEY") {
      throw new ForbiddenException("Human session is required to invite institution staff.");
    }

    const role = this.parseInstitutionRole(input.role);
    const institutionUuid = await this.resolveInviteInstitution(auth, input.institutionId);
    if (auth.role !== UserRole.ACADID_SUPER_ADMIN && auth.role !== UserRole.REGISTRAR) {
      throw new ForbiddenException("Only founders and registrars can invite institution users.");
    }
    if (auth.role === UserRole.REGISTRAR && role === UserRole.REGISTRAR) {
      throw new ForbiddenException("Registrar-to-registrar invitation requires founder approval.");
    }

    const email = input.email?.trim().toLowerCase();
    const fullName = input.fullName?.trim();
    if (!email || !fullName) {
      throw new BadRequestException("Invitee full name and email are required.");
    }

    const institution = await this.prisma.institution.findUnique({
      where: { uuid: institutionUuid },
      select: { uuid: true, institutionId: true, officialName: true, status: true }
    });
    if (!institution || institution.status !== "ACTIVE") {
      throw new BadRequestException("Active institution workspace not found.");
    }

    const inviteToken = this.createInviteToken();
    const inviteTokenHash = this.hashInviteToken(inviteToken);
    const permissions = input.permissions?.length ? input.permissions : this.defaultPermissionsForRole(role);
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const membership = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        update: {
          fullName,
          phone: input.phone?.trim() || undefined
        },
        create: {
          email,
          fullName,
          phone: input.phone?.trim() || undefined,
          role,
          passwordHash: this.passwordService.hash(randomBytes(32).toString("base64url"))
        }
      });

      return tx.institutionUser.upsert({
        where: {
          userId_institutionId_role: {
            userId: user.uuid,
            institutionId: institution.uuid,
            role
          }
        },
        update: {
          status: "INVITED",
          permissions,
          invitedById: auth.sub,
          inviteTokenHash,
          invitedAt: new Date(),
          inviteExpiresAt,
          inviteAcceptedAt: null,
          suspendedAt: null
        },
        create: {
          userId: user.uuid,
          institutionId: institution.uuid,
          role,
          status: "INVITED",
          permissions,
          invitedById: auth.sub,
          inviteTokenHash,
          invitedAt: new Date(),
          inviteExpiresAt
        },
        include: {
          user: {
            select: { uuid: true, email: true, fullName: true, phone: true }
          },
          institution: {
            select: { uuid: true, institutionId: true, officialName: true }
          }
        }
      });
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      institutionId: institution.uuid,
      action: "institution_user.invite",
      targetType: "InstitutionUser",
      targetId: membership.uuid,
      outcome: "SUCCESS",
      metadata: {
        invitedEmail: email,
        role,
        permissions
      }
    });

    return {
      invitation: {
        id: membership.uuid,
        status: membership.status,
        role: membership.role,
        permissions: membership.permissions,
        inviteExpiresAt: membership.inviteExpiresAt,
        user: membership.user,
        institution: membership.institution
      },
      inviteToken,
      warning: "Invite token is shown once for local/sandbox delivery. Send it only through a secure email/SMS provider."
    };
  }

  async acceptInstitutionInvite(input: { token?: string; password?: string; fullName?: string; phone?: string }) {
    const token = input.token?.trim();
    const password = input.password ?? "";
    if (!token || password.length < 8) {
      throw new BadRequestException("Invite token and a password of at least 8 characters are required.");
    }

    const membership = await this.prisma.institutionUser.findUnique({
      where: { inviteTokenHash: this.hashInviteToken(token) },
      include: {
        user: {
          select: { uuid: true, email: true, fullName: true }
        },
        institution: {
          select: { uuid: true, institutionId: true, officialName: true, status: true }
        }
      }
    });

    if (!membership || membership.status !== InstitutionUserStatus.INVITED || !membership.inviteExpiresAt || membership.inviteExpiresAt < new Date()) {
      throw new BadRequestException("Institution invitation is invalid or expired.");
    }
    if (membership.institution.status !== "ACTIVE") {
      throw new BadRequestException("Institution workspace is not active.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { uuid: membership.userId },
        data: {
          passwordHash: this.passwordService.hash(password),
          fullName: input.fullName?.trim() || membership.user.fullName,
          phone: input.phone?.trim() || undefined
        }
      });

      return tx.institutionUser.update({
        where: { uuid: membership.uuid },
        data: {
          status: "ACTIVE",
          inviteAcceptedAt: new Date(),
          inviteTokenHash: null
        },
        include: {
          user: {
            select: { uuid: true, email: true, fullName: true, phone: true }
          },
          institution: {
            select: { uuid: true, institutionId: true, officialName: true }
          }
        }
      });
    });

    await this.audit.write({
      actorId: membership.userId,
      actorRole: membership.role,
      institutionId: membership.institutionId,
      action: "institution_user.invite.accept",
      targetType: "InstitutionUser",
      targetId: membership.uuid,
      outcome: "SUCCESS"
    });

    return {
      accepted: true,
      user: updated.user,
      institution: updated.institution,
      role: updated.role,
      permissions: updated.permissions
    };
  }

  async me(auth: AuthTokenPayload) {
    return {
      user: {
        uuid: auth.sub,
        email: auth.email,
        fullName: auth.fullName,
        role: auth.role,
        kind: auth.kind ?? "USER",
        learnerId: auth.learnerId,
        institution: auth.institutionUuid
          ? {
              uuid: auth.institutionUuid,
              institutionId: auth.institutionId,
              officialName: auth.institutionName,
              membershipId: auth.institutionUserId
            }
          : null,
        permissions: auth.permissions ?? auth.scopes ?? [],
        sessionId: auth.sessionId
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

  private parseInstitutionRole(role?: string) {
    const normalized = role?.trim().toUpperCase();
    const allowed = new Set<UserRole>([UserRole.REGISTRAR, UserRole.EXAM_OFFICER, UserRole.DATA_ENTRY_OFFICER, UserRole.READ_ONLY]);
    if (!normalized || !allowed.has(normalized as UserRole)) {
      throw new BadRequestException("Role must be REGISTRAR, EXAM_OFFICER, DATA_ENTRY_OFFICER, or READ_ONLY.");
    }
    return normalized as UserRole;
  }

  private async resolveInviteInstitution(auth: AuthTokenPayload, requestedInstitutionId?: string) {
    if (auth.role === UserRole.ACADID_SUPER_ADMIN) {
      const value = requestedInstitutionId?.trim();
      if (!value) {
        throw new BadRequestException("institutionId is required for founder-created staff invitations.");
      }
      const institution = await this.prisma.institution.findFirst({
        where: this.isUuid(value) ? { uuid: value } : { institutionId: value },
        select: { uuid: true }
      });
      if (!institution) {
        throw new BadRequestException("Institution not found.");
      }
      return institution.uuid;
    }

    if (!auth.institutionUuid) {
      throw new ForbiddenException("Institution-scoped session is required.");
    }
    if (requestedInstitutionId && requestedInstitutionId !== auth.institutionUuid && requestedInstitutionId !== auth.institutionId) {
      throw new ForbiddenException("Cannot invite staff into another institution workspace.");
    }
    return auth.institutionUuid;
  }

  private defaultPermissionsForRole(role: UserRole) {
    if (role === UserRole.ACADID_SUPER_ADMIN) {
      return ["*"];
    }
    if (role === UserRole.REGISTRAR) {
      return ["staff:manage", "ingest:write", "govern:review", "govern:publish", "records:amend", "developer_tools:manage", "record_requests:approve"];
    }
    if (role === UserRole.EXAM_OFFICER) {
      return ["students:read", "results:read", "govern:review", "record_requests:verify"];
    }
    if (role === UserRole.DATA_ENTRY_OFFICER) {
      return ["students:write", "ingest:write", "results:draft", "govern:submit", "record_requests:upload"];
    }
    if (role === UserRole.READ_ONLY) {
      return ["students:read", "results:read", "credentials:read", "reports:read"];
    }
    return [];
  }

  private createInviteToken() {
    return `inv_${randomBytes(32).toString("base64url")}`;
  }

  private hashInviteToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
