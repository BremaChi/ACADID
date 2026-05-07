import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../../auth/guards/auth.guard.js";
import { RolesGuard } from "../../auth/guards/roles.guard.js";
import { ScopesGuard } from "../../auth/guards/scopes.guard.js";
import { Roles } from "../../auth/roles.decorator.js";
import { Scopes } from "../../auth/scopes.decorator.js";
import type { AuthenticatedRequest } from "../../auth/types.js";
import { IngestionService } from "./ingestion.service.js";

@UseGuards(AuthGuard, RolesGuard, ScopesGuard)
@Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER, UserRole.DATA_ENTRY_OFFICER)
@Scopes("ingest:write")
@Controller("ingest")
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post("academic-sessions")
  @Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER)
  @Scopes("academic_setup:write")
  createAcademicSession(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.ingestionService.createAcademicSession(request.auth, body);
  }

  @Get("academic-sessions")
  @Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER, UserRole.DATA_ENTRY_OFFICER, UserRole.DEPARTMENTAL_OFFICER, UserRole.READ_ONLY)
  @Scopes("academic_setup:read")
  listAcademicSessions(@Req() request: AuthenticatedRequest, @Query("institutionId") institutionId?: string) {
    return this.ingestionService.listAcademicSessions(request.auth, institutionId);
  }

  @Patch("academic-sessions/:id")
  @Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER)
  @Scopes("academic_setup:write")
  updateAcademicSession(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.ingestionService.updateAcademicSession(request.auth, id, body);
  }

  @Post("academic-structures")
  @Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER)
  @Scopes("academic_setup:write")
  createAcademicStructure(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.ingestionService.createAcademicStructure(request.auth, body);
  }

  @Get("academic-structures")
  @Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER, UserRole.DATA_ENTRY_OFFICER, UserRole.DEPARTMENTAL_OFFICER, UserRole.READ_ONLY)
  @Scopes("academic_setup:read")
  listAcademicStructures(
    @Req() request: AuthenticatedRequest,
    @Query("institutionId") institutionId?: string,
    @Query("parentId") parentId?: string,
    @Query("type") type?: string
  ) {
    return this.ingestionService.listAcademicStructures(request.auth, { institutionId, parentId, type });
  }

  @Patch("academic-structures/:id")
  @Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER)
  @Scopes("academic_setup:write")
  updateAcademicStructure(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.ingestionService.updateAcademicStructure(request.auth, id, body);
  }

  @Post("students")
  ingestStudents(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.ingestionService.ingestStudents(request.auth, body);
  }

  @Post("results")
  ingestResults(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.ingestionService.ingestResults(request.auth, body);
  }

  @Post("bulk-upload")
  bulkUpload(@Body() body: unknown) {
    return this.ingestionService.createBulkUpload(body);
  }

  @Get("batches")
  listBatches(@Req() request: AuthenticatedRequest) {
    return this.ingestionService.listBatches(request.auth);
  }

  @Get("batches/:id")
  readBatch(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.ingestionService.readBatch(request.auth, id);
  }
}
