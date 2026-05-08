import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { JobsController } from "./jobs.controller.js";

@Module({
  imports: [PlatformServicesModule, AuthModule],
  controllers: [JobsController]
})
export class JobsModule {}
