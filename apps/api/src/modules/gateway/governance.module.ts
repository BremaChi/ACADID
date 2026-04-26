import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { GovernanceController } from "./governance/governance.controller.js";
import { GovernanceService } from "./governance/governance.service.js";

@Module({
  imports: [PlatformServicesModule, AuthModule],
  controllers: [GovernanceController],
  providers: [GovernanceService]
})
export class GovernanceModule {}
