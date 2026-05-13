import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../../auth/guards/auth.guard.js";
import { RolesGuard } from "../../auth/guards/roles.guard.js";
import { ScopesGuard } from "../../auth/guards/scopes.guard.js";
import { Roles } from "../../auth/roles.decorator.js";
import { Scopes } from "../../auth/scopes.decorator.js";
import type { AuthenticatedRequest } from "../../auth/types.js";
import { RateLimit } from "../../platform/decorators/rate-limit.decorator.js";
import { RateLimitGuard } from "../../platform/guards/rate-limit.guard.js";
import { IngestionService } from "./ingestion.service.js";

@UseGuards(AuthGuard, RateLimitGuard, RolesGuard, ScopesGuard)
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

  @Post("grading-rules")
  @Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER)
  @Scopes("academic_setup:write")
  createGradingRuleSet(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.ingestionService.createGradingRuleSet(request.auth, body);
  }

  @Get("grading-rules")
  @Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER, UserRole.DATA_ENTRY_OFFICER, UserRole.DEPARTMENTAL_OFFICER, UserRole.READ_ONLY)
  @Scopes("academic_setup:read")
  listGradingRuleSets(@Req() request: AuthenticatedRequest, @Query("institutionId") institutionId?: string) {
    return this.ingestionService.listGradingRuleSets(request.auth, institutionId);
  }

  @Patch("grading-rules/:id")
  @Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER)
  @Scopes("academic_setup:write")
  updateGradingRuleSet(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.ingestionService.updateGradingRuleSet(request.auth, id, body);
  }

  @Post("students")
  @RateLimit({ scope: "ingest.students", key: "auth", limit: 60, windowSeconds: 60 })
  ingestStudents(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.ingestionService.ingestStudents(request.auth, body);
  }

  @Post("results")
  @RateLimit({ scope: "ingest.results", key: "auth", limit: 60, windowSeconds: 60 })
  ingestResults(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.ingestionService.ingestResults(request.auth, body);
  }

  @Post("results/async")
  @RateLimit({ scope: "ingest.results_async", key: "auth", limit: 120, windowSeconds: 60 })
  ingestResultsAsync(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Headers("x-idempotency-key") idempotencyKey?: string) {
    return this.ingestionService.queueResultBatchValidation(request.auth, body, idempotencyKey);
  }

  @Post("bulk-upload")
  @RateLimit({ scope: "ingest.bulk_upload", key: "auth", limit: 30, windowSeconds: 60 })
  bulkUpload(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Headers("x-idempotency-key") idempotencyKey?: string) {
    return this.ingestionService.createBulkUpload(request.auth, body, idempotencyKey);
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
