import { Injectable, UnauthorizedException } from "@nestjs/common";
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
      fullName: user.fullName
    });

    return {
      accessToken,
      tokenType: "Bearer",
      user: {
        uuid: user.uuid,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mfaEnabled: user.mfaEnabled
      }
    };
  }
}
