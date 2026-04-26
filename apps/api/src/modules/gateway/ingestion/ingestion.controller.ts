import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { IngestionService } from "./ingestion.service.js";

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
