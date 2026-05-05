import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import type { AuthenticatedRequest } from "./types.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: { email: string; password: string; totpCode?: string; recoveryCode?: string }) {
    if (!body?.email || !body.password) {
      throw new BadRequestException("Email and password are required.");
    }

    return this.authService.login(body.email, body.password, body.totpCode, body.recoveryCode);
  }

  @Post("user/login")
  userLogin(@Body() body: { email: string; password: string; totpCode?: string; recoveryCode?: string }) {
    if (!body?.email || !body.password) {
      throw new BadRequestException("Email and password are required.");
    }

    return this.authService.login(body.email, body.password, body.totpCode, body.recoveryCode);
  }

  @UseGuards(AuthGuard)
  @Post("user/invite")
  inviteUser(
    @Req() request: AuthenticatedRequest,
    @Body() body: { institutionId?: string; email?: string; fullName?: string; phone?: string; role?: string; permissions?: string[] }
  ) {
    return this.authService.inviteInstitutionUser(request.auth, body);
  }

  @Post("user/accept-invite")
  acceptInvite(@Body() body: { token?: string; password?: string; fullName?: string; phone?: string }) {
    if (!body?.token || !body.password) {
      throw new BadRequestException("Invite token and password are required.");
    }

    return this.authService.acceptInstitutionInvite(body);
  }

  @Post("user/reset-password")
  resetPassword() {
    return {
      accepted: true,
      delivery: "RECORDED_FOR_EMAIL_PROVIDER"
    };
  }

  @Post("token")
  token(@Body() body: { client_id?: string; clientId?: string; client_secret?: string; clientSecret?: string }) {
    return this.authService.issueApiToken(body);
  }

  @Post("logout")
  logout() {
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Post("user/logout")
  userLogout() {
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Post("mfa/setup")
  setupMfa(@Req() request: AuthenticatedRequest) {
    return this.authService.setupTotp(request.auth);
  }

  @UseGuards(AuthGuard)
  @Post("mfa/enable")
  enableMfa(@Req() request: AuthenticatedRequest, @Body() body: { code?: string }) {
    if (!body?.code) {
      throw new BadRequestException("TOTP code is required.");
    }

    return this.authService.enableTotp(request.auth, body.code);
  }

  @UseGuards(AuthGuard)
  @Get("mfa/recovery-codes")
  recoveryCodeStatus(@Req() request: AuthenticatedRequest) {
    return this.authService.recoveryCodeStatus(request.auth);
  }

  @UseGuards(AuthGuard)
  @Post("mfa/recovery-codes/rotate")
  rotateRecoveryCodes(@Req() request: AuthenticatedRequest, @Body() body: { code?: string }) {
    if (!body?.code) {
      throw new BadRequestException("TOTP code is required.");
    }

    return this.authService.rotateRecoveryCodes(request.auth, body.code);
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.me(request.auth);
  }

  @UseGuards(AuthGuard)
  @Get("user/me")
  userMe(@Req() request: AuthenticatedRequest) {
    return this.authService.me(request.auth);
  }
}
