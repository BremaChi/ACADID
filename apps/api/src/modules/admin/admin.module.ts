import { Module } from "@nestjs/common";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";

@Module({
  imports: [PlatformServicesModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
