import { Module } from "@nestjs/common";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { IngestionController } from "./ingestion/ingestion.controller.js";
import { IngestionService } from "./ingestion/ingestion.service.js";

@Module({
  imports: [PlatformServicesModule],
  controllers: [IngestionController],
  providers: [IngestionService]
})
export class IngestionModule {}
