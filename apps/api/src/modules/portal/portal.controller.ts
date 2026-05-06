import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ScopesGuard } from "../auth/guards/scopes.guard.js";
import { Scopes } from "../auth/scopes.decorator.js";
import type { AuthenticatedRequest } from "../auth/types.js";
import { PortalService } from "./portal.service.js";

@Controller("portal")
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get("mou-version")
  readMouVersion() {
    return this.portalService.readMouVersion();
  }

  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes("institution:apply")
  @Post("upload-urls")
  issueUploadUrl(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.portalService.issueUploadUrl(request.auth, body);
  }

  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes("institution:apply")
  @Post("institution-applications")
  createInstitutionApplication(@Body() body: unknown) {
    return this.portalService.createInstitutionApplication(body);
  }
}
