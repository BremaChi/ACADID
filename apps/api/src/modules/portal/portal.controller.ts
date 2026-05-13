import { Body, Controller, Get, Headers, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ScopesGuard } from "../auth/guards/scopes.guard.js";
import { Scopes } from "../auth/scopes.decorator.js";
import type { AuthenticatedRequest } from "../auth/types.js";
import { RateLimit } from "../platform/decorators/rate-limit.decorator.js";
import { RateLimitGuard } from "../platform/guards/rate-limit.guard.js";
import { PortalService } from "./portal.service.js";

@Controller("portal")
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get("mou-version")
  readMouVersion() {
    return this.portalService.readMouVersion();
  }

  @UseGuards(AuthGuard, RateLimitGuard, ScopesGuard)
  @Scopes("institution:apply")
  @RateLimit({ scope: "portal.upload_urls", key: "auth", limit: 60, windowSeconds: 60 })
  @Post("upload-urls")
  issueUploadUrl(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.portalService.issueUploadUrl(request.auth, body);
  }

  @UseGuards(AuthGuard, RateLimitGuard, ScopesGuard)
  @Scopes("institution:apply")
  @RateLimit({ scope: "portal.institution_applications", key: "auth", limit: 30, windowSeconds: 60 })
  @Post("institution-applications")
  createInstitutionApplication(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Headers("x-idempotency-key") idempotencyKey?: string) {
    return this.portalService.createInstitutionApplication(request.auth, body, idempotencyKey);
  }

  @UseGuards(AuthGuard, RateLimitGuard, ScopesGuard)
  @Scopes("staff:manage")
  @RateLimit({ scope: "portal.staff.list", key: "auth", limit: 120, windowSeconds: 60 })
  @Get("staff")
  listStaff(@Req() request: AuthenticatedRequest) {
    return this.portalService.listStaff(request.auth);
  }

  @UseGuards(AuthGuard, RateLimitGuard, ScopesGuard)
  @Scopes("staff:manage")
  @RateLimit({ scope: "portal.staff.scope_options", key: "auth", limit: 120, windowSeconds: 60 })
  @Get("staff/scope-options")
  readStaffScopeOptions(@Req() request: AuthenticatedRequest) {
    return this.portalService.readStaffScopeOptions(request.auth);
  }

  @UseGuards(AuthGuard, RateLimitGuard, ScopesGuard)
  @Scopes("staff:manage")
  @RateLimit({ scope: "portal.staff.invite", key: "auth", limit: 30, windowSeconds: 60 })
  @Post("staff/invite")
  inviteStaff(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.portalService.inviteStaff(request.auth, body);
  }

  @UseGuards(AuthGuard, RateLimitGuard, ScopesGuard)
  @Scopes("staff:manage")
  @RateLimit({ scope: "portal.staff.update", key: "auth", limit: 60, windowSeconds: 60 })
  @Patch("staff/:id")
  updateStaff(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.portalService.updateStaff(request.auth, id, body);
  }
}
