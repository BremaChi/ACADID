import { Module } from "@nestjs/common";
import { AuditService } from "./services/audit.service.js";
import { AuthorityService } from "./services/authority.service.js";
import { CredentialSigningService } from "./services/credential-signing.service.js";
import { PrismaService } from "./services/prisma.service.js";
import { QueueService } from "./services/queue.service.js";
import { RateLimitService } from "./services/rate-limit.service.js";
import { RateLimitGuard } from "./guards/rate-limit.guard.js";

@Module({
  providers: [PrismaService, AuditService, AuthorityService, CredentialSigningService, QueueService, RateLimitService, RateLimitGuard],
  exports: [PrismaService, AuditService, AuthorityService, CredentialSigningService, QueueService, RateLimitService, RateLimitGuard]
})
export class PlatformServicesModule {}
