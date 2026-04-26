import { Module } from "@nestjs/common";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { AccessController } from "./access/access.controller.js";
import { AccessService } from "./access/access.service.js";

@Module({
  imports: [PlatformServicesModule],
  controllers: [AccessController],
  providers: [AccessService]
})
export class AccessModule {}
