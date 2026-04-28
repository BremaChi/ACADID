import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../platform/services/prisma.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService
  ) {}

  async login(email: string, password: string) {
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
        mfaEnabled: true
      }
    });

    if (!user || !this.passwordService.verify(password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password.");
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
      apiKey.institution.status !== "ACTIVE" ||
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
      institutionId: apiKey.institution.institutionId,
      institutionUuid: apiKey.institution.uuid,
      apiKeyId: apiKey.uuid,
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
        institutionId: apiKey.institution.institutionId,
        institutionName: apiKey.institution.officialName,
        scopes: apiKey.scopes,
        environment: apiKey.environment,
        rateLimitPerMinute: apiKey.rateLimitPerMinute
      }
    };
  }
}
