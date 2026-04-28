import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import type { AuthenticatedRequest } from "./types.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: { email: string; password: string; totpCode?: string }) {
    if (!body?.email || !body.password) {
      throw new BadRequestException("Email and password are required.");
    }

    return this.authService.login(body.email, body.password, body.totpCode);
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
  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return {
      user: request.auth
    };
  }
}
