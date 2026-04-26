import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../../auth/guards/auth.guard.js";
import { RolesGuard } from "../../auth/guards/roles.guard.js";
import { Roles } from "../../auth/roles.decorator.js";
import { IngestionService } from "./ingestion.service.js";

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER, UserRole.DATA_ENTRY_OFFICER)
@Controller("ingest")
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post("students")
  ingestStudents(@Body() body: unknown) {
    return this.ingestionService.ingestStudents(body);
  }

  @Post("results")
  ingestResults(@Body() body: unknown) {
    return this.ingestionService.ingestResults(body);
  }

  @Post("bulk-upload")
  bulkUpload(@Body() body: unknown) {
    return this.ingestionService.createBulkUpload(body);
  }

  @Get("batches")
  listBatches() {
    return this.ingestionService.listBatches();
  }

  @Get("batches/:id")
  readBatch(@Param("id") id: string) {
    return this.ingestionService.readBatch(id);
  }
}
