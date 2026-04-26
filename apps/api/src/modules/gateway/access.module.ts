import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { AccessController } from "./access/access.controller.js";
import { AccessService } from "./access/access.service.js";

@Module({
  imports: [PlatformServicesModule, AuthModule],
  controllers: [AccessController],
  providers: [AccessService]
})
export class AccessModule {}
