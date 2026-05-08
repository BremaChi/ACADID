import { Module } from "@nestjs/common";
import { IngestionModule } from "./gateway/ingestion.module.js";
import { JobWorkerService } from "./jobs/job-worker.service.js";
import { PlatformServicesModule } from "./platform/platform-services.module.js";

@Module({
  imports: [PlatformServicesModule, IngestionModule],
  providers: [JobWorkerService],
  exports: [JobWorkerService]
})
export class WorkerModule {}
