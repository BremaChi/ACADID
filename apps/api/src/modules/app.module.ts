import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AccessModule } from "./gateway/access.module.js";
import { GovernanceModule } from "./gateway/governance.module.js";
import { IngestionModule } from "./gateway/ingestion.module.js";
import { VerificationModule } from "./gateway/verification.module.js";
import { HealthController } from "./health.controller.js";
import { RequestAuditInterceptor } from "./platform/interceptors/request-audit.interceptor.js";
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
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestAuditInterceptor
    }
  ]
})
export class AppModule {}
