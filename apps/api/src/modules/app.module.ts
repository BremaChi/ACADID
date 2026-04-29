import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AccessModule } from "./gateway/access.module.js";
import { GovernanceModule } from "./gateway/governance.module.js";
import { IngestionModule } from "./gateway/ingestion.module.js";
import { VerificationModule } from "./gateway/verification.module.js";
import { HealthController } from "./health.controller.js";
import { PlatformServicesModule } from "./platform/platform-services.module.js";
import { PortalModule } from "./portal/portal.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PlatformServicesModule,
    AuthModule,
    AdminModule,
    IngestionModule,
    GovernanceModule,
    AccessModule,
    VerificationModule,
    PortalModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
