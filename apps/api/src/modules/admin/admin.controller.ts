import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { AdminService } from "./admin.service.js";

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
}
