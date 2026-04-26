import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../../auth/guards/auth.guard.js";
import { RolesGuard } from "../../auth/guards/roles.guard.js";
import { Roles } from "../../auth/roles.decorator.js";
import type { AuthenticatedRequest } from "../../auth/types.js";
import { IngestionService } from "./ingestion.service.js";

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER, UserRole.DATA_ENTRY_OFFICER)
@Controller("ingest")
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

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
