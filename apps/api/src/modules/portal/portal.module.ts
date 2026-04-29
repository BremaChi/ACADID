import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { PortalController } from "./portal.controller.js";
import { PortalService } from "./portal.service.js";

@Module({
  imports: [AuthModule, PlatformServicesModule],
  controllers: [PortalController],
  providers: [PortalService]
})
export class PortalModule {}
