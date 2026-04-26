import { Module } from "@nestjs/common";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { VerificationController } from "./verification/verification.controller.js";
import { VerificationService } from "./verification/verification.service.js";

@Module({
  imports: [PlatformServicesModule],
  controllers: [VerificationController],
  providers: [VerificationService]
})
export class VerificationModule {}
