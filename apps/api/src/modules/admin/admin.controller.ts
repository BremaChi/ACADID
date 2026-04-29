import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { DeveloperAccessRequestStatus, UserRole } from "@prisma/client";
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

  @Get("institution-applications")
  listInstitutionApplications(@Query("status") status?: "PENDING" | "APPROVED" | "REJECTED") {
    return this.adminService.listInstitutionApplications(status);
  }

  @Post("institution-applications/:id/approve")
  approveInstitutionApplication(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.adminService.approveInstitutionApplication(request.auth, id);
  }

  @Post("institution-applications/:id/reject")
  rejectInstitutionApplication(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: { feedback?: string }) {
    return this.adminService.rejectInstitutionApplication(request.auth, id, body?.feedback);
  }

  @Get("developer-access-requests")
  listDeveloperAccessRequests(@Query("status") status?: DeveloperAccessRequestStatus) {
    return this.adminService.listDeveloperAccessRequests(status);
  }

  @Post("developer-access-requests")
  createDeveloperAccessRequest(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.adminService.createDeveloperAccessRequest(request.auth, body);
  }

  @Post("developer-access-requests/:id/approve")
  approveDeveloperAccessRequest(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: { feedback?: string }) {
    return this.adminService.approveDeveloperAccessRequest(request.auth, id, body?.feedback);
  }

  @Post("developer-access-requests/:id/reject")
  rejectDeveloperAccessRequest(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: { feedback?: string }) {
    return this.adminService.rejectDeveloperAccessRequest(request.auth, id, body?.feedback);
  }

  @Post("developer-access-requests/:id/suspend")
  suspendDeveloperAccessRequest(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: { feedback?: string }) {
    return this.adminService.suspendDeveloperAccessRequest(request.auth, id, body?.feedback);
  }

  @Post("institutions/:id/api-keys")
  createApiKey(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.adminService.createApiKey(request.auth, id, body);
  }

  @Post("product-api-keys")
  createProductApiKey(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.adminService.createProductApiKey(request.auth, body);
  }

  @Get("api-keys")
  listGlobalApiKeys() {
    return this.adminService.listGlobalApiKeys();
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
