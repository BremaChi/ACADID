import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../../auth/guards/auth.guard.js";
import { RolesGuard } from "../../auth/guards/roles.guard.js";
import { Roles } from "../../auth/roles.decorator.js";
import type { AuthenticatedRequest } from "../../auth/types.js";
import { AccessService } from "./access.service.js";

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller("access")
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Get("passport")
  passport(@Req() request: AuthenticatedRequest) {
    return this.accessService.passport(request.auth);
  }

  @Get("credentials")
  credentials(@Req() request: AuthenticatedRequest) {
    return this.accessService.credentials(request.auth);
  }

  @Post("share-link")
  createShareLink(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.accessService.createShareLink(request.auth, body);
  }

  @Post("revoke-grant")
  revokeGrant(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.accessService.revokeGrant(request.auth, body);
  }

  @Get("verification-log")
  verificationLog(@Req() request: AuthenticatedRequest) {
    return this.accessService.verificationLog(request.auth);
  }
}
