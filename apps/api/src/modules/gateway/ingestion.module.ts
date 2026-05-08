import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { IngestionController } from "./ingestion/ingestion.controller.js";
import { IngestionService } from "./ingestion/ingestion.service.js";

@Module({
  imports: [PlatformServicesModule, AuthModule],
  controllers: [IngestionController],
  providers: [IngestionService],
  exports: [IngestionService]
})
export class IngestionModule {}
