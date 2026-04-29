import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ScopesGuard } from "../auth/guards/scopes.guard.js";
import { Scopes } from "../auth/scopes.decorator.js";
import { PortalService } from "./portal.service.js";

@Controller("portal")
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes("institution:apply")
  @Post("institution-applications")
  createInstitutionApplication(@Body() body: unknown) {
    return this.portalService.createInstitutionApplication(body);
  }
}
