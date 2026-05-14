import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AccessModule } from "./gateway/access.module.js";
import { GovernanceModule } from "./gateway/governance.module.js";
import { IngestionModule } from "./gateway/ingestion.module.js";
import { VerificationModule } from "./gateway/verification.module.js";
import { HealthController } from "./health.controller.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { ApiExceptionFilter } from "./platform/filters/api-exception.filter.js";
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
    JobsModule,
    PaymentsModule,
    PortalModule
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestAuditInterceptor
    }
  ]
})
export class AppModule {}
