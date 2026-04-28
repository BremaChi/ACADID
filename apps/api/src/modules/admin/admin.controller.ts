import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { Roles } from "../auth/roles.decorator.js";
import type { AuthenticatedRequest } from "../auth/types.js";
import { AdminService } from "./admin.service.js";

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ACADID_SUPER_ADMIN)
@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post("institutions")
  createInstitution(@Body() body: unknown) {
    return this.adminService.createInstitution(body);
  }

  @Get("institutions")
  listInstitutions() {
    return this.adminService.listInstitutions();
  }

  @Patch("institutions/:id/status")
  updateInstitutionStatus(@Param("id") id: string, @Body() body: { status: "ACTIVE" | "SUSPENDED" }) {
    return this.adminService.updateInstitutionStatus(id, body.status);
  }

  @Post("institutions/:id/authority-grants")
  createAuthorityGrant(@Param("id") id: string, @Body() body: unknown) {
    return this.adminService.createAuthorityGrant(id, body);
  }

  @Post("institutions/:id/api-keys")
  createApiKey(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.adminService.createApiKey(request.auth, id, body);
  }

  @Get("institutions/:id/api-keys")
  listApiKeys(@Param("id") id: string) {
    return this.adminService.listApiKeys(id);
  }

  @Patch("api-keys/:id/revoke")
  revokeApiKey(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: { reason?: string }) {
    return this.adminService.revokeApiKey(request.auth, id, body?.reason);
  }
}
