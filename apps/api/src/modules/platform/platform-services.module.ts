import { Module } from "@nestjs/common";
import { AuditService } from "./services/audit.service.js";
import { AuthorityService } from "./services/authority.service.js";
import { CredentialSigningService } from "./services/credential-signing.service.js";
import { PrismaService } from "./services/prisma.service.js";
import { QueueService } from "./services/queue.service.js";
import { RateLimitService } from "./services/rate-limit.service.js";
import { RateLimitGuard } from "./guards/rate-limit.guard.js";
import { ErrorObservabilityService } from "./services/error-observability.service.js";
import { IdempotencyService } from "./services/idempotency.service.js";
import { NotificationDeliveryService } from "./services/notification-delivery.service.js";
import { StructuredLoggerService } from "./services/structured-logger.service.js";
import { CacheService } from "./services/cache.service.js";
import { RetryPolicyService } from "./services/retry-policy.service.js";
import { WebhookSecretService } from "./services/webhook-secret.service.js";
import { ObjectStorageService } from "../jobs/object-storage.service.js";

@Module({
  providers: [
    PrismaService,
    AuditService,
    AuthorityService,
    CredentialSigningService,
    QueueService,
    RateLimitService,
    RateLimitGuard,
    IdempotencyService,
    NotificationDeliveryService,
    StructuredLoggerService,
    ErrorObservabilityService,
    CacheService,
    RetryPolicyService,
    WebhookSecretService,
    ObjectStorageService
  ],
  exports: [
    PrismaService,
    AuditService,
    AuthorityService,
    CredentialSigningService,
    QueueService,
    RateLimitService,
    RateLimitGuard,
    IdempotencyService,
    NotificationDeliveryService,
    StructuredLoggerService,
    ErrorObservabilityService,
    CacheService,
    RetryPolicyService,
    WebhookSecretService,
    ObjectStorageService
  ]
})
export class PlatformServicesModule {}
