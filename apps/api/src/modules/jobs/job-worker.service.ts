import { createHmac } from "node:crypto";
import { hostname } from "node:os";
import { Injectable, Logger } from "@nestjs/common";
import { BackgroundJobStatus, BackgroundJobType, Prisma, UserRole, WebhookDeliveryStatus, WorkerHeartbeatStatus } from "@prisma/client";
import type { AuthTokenPayload } from "../auth/types.js";
import { IngestionService } from "../gateway/ingestion/ingestion.service.js";
import { ErrorObservabilityService } from "../platform/services/error-observability.service.js";
import { IdempotencyService } from "../platform/services/idempotency.service.js";
import { NotificationDeliveryService } from "../platform/services/notification-delivery.service.js";
import { PrismaService } from "../platform/services/prisma.service.js";
import { RateLimitService } from "../platform/services/rate-limit.service.js";
import { WebhookSecretService } from "../platform/services/webhook-secret.service.js";
import { BulkUploadParserService, NonRetryableJobError } from "./bulk-upload-parser.service.js";

type ClaimedJob = {
  uuid: string;
  type: BackgroundJobType;
  queue: string;
  institutionId: string | null;
  createdById: string | null;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
};

type WorkerRunResult = {
  processed: number;
  succeeded: number;
  failed: number;
};

type WebhookDeliveryRecord = {
  uuid: string;
  targetUrl: string;
  eventType: string;
  payload: Prisma.JsonValue;
  attempts: number;
  webhookEndpoint: {
    uuid: string;
    status: string;
    secretEncrypted: string;
  } | null;
};

const workerQueues = [
  "ingestion.bulk",
  "results.validation",
  "credentials.generation",
  "documents.pdf",
  "notifications.delivery",
  "payments.paystack",
  "record-requests.deadlines",
  "webhooks.delivery",
  "notifications.push",
  "live-results.callbacks",
  "exam-body.ingest",
  "platform.maintenance"
];

@Injectable()
export class JobWorkerService {
  private readonly logger = new Logger(JobWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
    private readonly bulkUploadParser: BulkUploadParserService,
    private readonly observability?: ErrorObservabilityService,
    private readonly webhookSecrets?: WebhookSecretService,
    private readonly rateLimit?: RateLimitService,
    private readonly notificationDelivery?: NotificationDeliveryService,
    private readonly idempotency?: IdempotencyService
  ) {}

  async runOnce(workerId = this.defaultWorkerId(), batchSize = 5): Promise<WorkerRunResult> {
    const result: WorkerRunResult = { processed: 0, succeeded: 0, failed: 0 };
    await this.recordHeartbeat(workerId, { concurrency: batchSize });

    for (let index = 0; index < batchSize; index += 1) {
      const job = await this.claimNextJob(workerId);
      if (!job) {
        await this.recordHeartbeat(workerId, { concurrency: batchSize });
        break;
      }

      result.processed += 1;
      await this.recordHeartbeat(workerId, { concurrency: batchSize, currentJob: job });
      try {
        const processorResult = await this.processJob(job);
        await this.completeJob(job, processorResult);
        result.succeeded += 1;
      } catch (error) {
        await this.failOrRetryJob(job, error);
        result.failed += 1;
      } finally {
        await this.recordHeartbeat(workerId, { concurrency: batchSize });
      }
    }

    return result;
  }

  async startLoop(options: { workerId?: string; intervalMs?: number; batchSize?: number; once?: boolean } = {}) {
    const workerId = options.workerId ?? this.defaultWorkerId();
    const intervalMs = options.intervalMs ?? 5000;
    const batchSize = options.batchSize ?? 5;

    this.logger.log(`AcadID worker started as ${workerId}`);
    await this.recordHeartbeat(workerId, { concurrency: batchSize, status: WorkerHeartbeatStatus.ACTIVE, started: true });
    do {
      const result = await this.runOnce(workerId, batchSize);
      if (options.once) {
        await this.markWorkerStopped(workerId);
        return result;
      }
      if (result.processed === 0) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    } while (true);
  }

  resolveWorkerId(workerId?: string) {
    return workerId ?? this.defaultWorkerId();
  }

  async markWorkerStopped(workerId: string) {
    await this.recordHeartbeat(workerId, { status: WorkerHeartbeatStatus.STOPPED });
  }

  async claimNextJob(workerId: string): Promise<ClaimedJob | null> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.$queryRaw<Array<{ uuid: string }>>`
        SELECT "uuid"
        FROM "BackgroundJob"
        WHERE "status" IN ('QUEUED', 'RETRYING')
          AND "queue" IN (${Prisma.join(workerQueues)})
          AND "runAfter" <= NOW()
        ORDER BY "priority" DESC, "runAfter" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;

      const next = claimed[0];
      if (!next) {
        return null;
      }

      return tx.backgroundJob.update({
        where: { uuid: next.uuid },
        data: {
          status: BackgroundJobStatus.RUNNING,
          lockedAt: new Date(),
          lockedBy: workerId,
          startedAt: new Date(),
          attempts: { increment: 1 },
          error: null,
          progress: 10
        },
        select: {
          uuid: true,
          type: true,
          queue: true,
          institutionId: true,
          createdById: true,
          payload: true,
          attempts: true,
          maxAttempts: true
        }
      });
    });
  }

  private async recordHeartbeat(
    workerId: string,
    options: {
      concurrency?: number;
      status?: WorkerHeartbeatStatus;
      started?: boolean;
      currentJob?: ClaimedJob;
    } = {}
  ) {
    const now = new Date();
    const workerHeartbeat = (this.prisma as unknown as { workerHeartbeat?: { upsert: (args: unknown) => Promise<unknown> } }).workerHeartbeat;
    if (!workerHeartbeat) {
      return;
    }
    try {
      await workerHeartbeat.upsert({
        where: { workerId },
        create: {
          workerId,
          hostname: hostname(),
          processId: process.pid,
          queues: workerQueues,
          status: options.status ?? WorkerHeartbeatStatus.ACTIVE,
          concurrency: options.concurrency ?? 1,
          currentJobId: options.currentJob?.uuid,
          currentQueue: options.currentJob?.queue,
          lastStartedAt: options.started ? now : undefined,
          lastSeenAt: now,
          metadata: this.toJson({
            nodeVersion: process.version,
            platform: process.platform,
            runtime: "node"
          })
        },
        update: {
          hostname: hostname(),
          processId: process.pid,
          queues: workerQueues,
          status: options.status ?? WorkerHeartbeatStatus.ACTIVE,
          concurrency: options.concurrency ?? 1,
          currentJobId: options.currentJob?.uuid ?? null,
          currentQueue: options.currentJob?.queue ?? null,
          ...(options.started ? { lastStartedAt: now } : {}),
          lastSeenAt: now,
          metadata: this.toJson({
            nodeVersion: process.version,
            platform: process.platform,
            runtime: "node"
          })
        }
      });
    } catch (error) {
      this.logger.warn(`Worker heartbeat failed for ${workerId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processJob(job: ClaimedJob): Promise<Prisma.InputJsonValue> {
    switch (job.type) {
      case BackgroundJobType.BULK_STUDENT_UPLOAD:
        return this.processBulkStudentUpload(job);
      case BackgroundJobType.RESULT_BATCH_VALIDATION:
        return this.processResultBatchValidation(job);
      case BackgroundJobType.WEBHOOK_DELIVERY:
        return this.processWebhookDelivery(job);
      case BackgroundJobType.PUSH_NOTIFICATION:
      case BackgroundJobType.SMS_EMAIL_DELIVERY:
        return this.processNotificationDelivery(job);
      case BackgroundJobType.CREDENTIAL_GENERATION:
      case BackgroundJobType.PDF_GENERATION:
      case BackgroundJobType.PAYSTACK_PAYMENT_CONFIRMATION:
      case BackgroundJobType.RECORD_REQUEST_DEADLINE:
      case BackgroundJobType.LIVE_RESULTS_CALLBACK:
      case BackgroundJobType.EXAM_BODY_INGEST:
        return this.processDeferredIntegration(job);
      case BackgroundJobType.RATE_LIMIT_BUCKET_CLEANUP:
        return this.processRateLimitBucketCleanup(job);
      case BackgroundJobType.IDEMPOTENCY_RECORD_CLEANUP:
        return this.processIdempotencyRecordCleanup(job);
    }
  }

  private async processBulkStudentUpload(job: ClaimedJob): Promise<Prisma.InputJsonValue> {
    const payload = this.asRecord(job.payload);
    const request = this.asRecord(payload.request);
    if (!Array.isArray(request.rows) && this.isMetadataOnlyUpload(request)) {
      return this.toJson({
        mode: "metadata_only",
        message: "Bulk upload job accepted. File parser will run when rows, csvText, contentBase64, filePath, or readable storageUrl is attached.",
        fileName: request.fileName ?? null,
        uploadType: request.uploadType ?? null,
        storageUrl: request.storageUrl ?? null
      });
    }

    const parsed = await this.bulkUploadParser.parseStudentUpload(request);
    const result = await this.ingestion.ingestStudents(this.systemAuth(job), parsed.input);
    return this.toJson({
      mode: "processed_file",
      source: parsed.source,
      createdLearners: result.createdLearners,
      linkedLearners: result.linkedLearners,
      createdEnrolments: result.createdEnrolments,
      existingEnrolments: result.existingEnrolments,
      rowCount: result.rows.length
    });
  }

  private async processResultBatchValidation(job: ClaimedJob): Promise<Prisma.InputJsonValue> {
    const payload = this.asRecord(job.payload);
    const request = payload.request;
    const result = await this.ingestion.ingestResults(this.systemAuth(job), request);
    return this.toJson({
      mode: "draft_batch_created",
      batchId: result.batchId,
      status: result.status,
      institutionId: result.institutionId,
      rowCount: result.rowCount
    });
  }

  private async processWebhookDelivery(job: ClaimedJob): Promise<Prisma.InputJsonValue> {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { jobId: job.uuid, status: { in: [WebhookDeliveryStatus.PENDING, WebhookDeliveryStatus.RETRYING] } },
      orderBy: { createdAt: "asc" },
      select: {
        uuid: true,
        targetUrl: true,
        eventType: true,
        payload: true,
        attempts: true,
        webhookEndpoint: {
          select: {
            uuid: true,
            status: true,
            secretEncrypted: true
          }
        }
      }
    });

    if (!delivery) {
      return this.toJson({
        mode: "no_pending_delivery",
        message: "No pending webhook delivery record was found for this job."
      });
    }

    const attempt = delivery.attempts + 1;
    const body = this.serializeWebhookBody(delivery, attempt);
    const headers = this.buildWebhookHeaders(delivery, body);

    await this.prisma.webhookDelivery.update({
      where: { uuid: delivery.uuid },
      data: {
        status: WebhookDeliveryStatus.RETRYING,
        attempts: { increment: 1 },
        lastStatusCode: null,
        lastError: null,
        nextAttemptAt: new Date(Date.now() + this.retryDelayMs(job.attempts))
      }
    });

    let response: Response;
    try {
      response = await fetch(delivery.targetUrl, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(this.webhookTimeoutMs())
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.webhookDelivery.update({
        where: { uuid: delivery.uuid },
        data: {
          status: WebhookDeliveryStatus.RETRYING,
          lastError: message,
          nextAttemptAt: new Date(Date.now() + this.retryDelayMs(job.attempts))
        }
      });
      throw new Error(`Webhook delivery ${delivery.uuid} failed: ${message}`);
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const message = `HTTP ${response.status}${responseText ? `: ${responseText.slice(0, 500)}` : ""}`;
      await this.prisma.webhookDelivery.update({
        where: { uuid: delivery.uuid },
        data: {
          status: WebhookDeliveryStatus.RETRYING,
          lastStatusCode: response.status,
          lastError: message,
          nextAttemptAt: new Date(Date.now() + this.retryDelayMs(job.attempts))
        }
      });
      throw new Error(`Webhook delivery ${delivery.uuid} failed: ${message}`);
    }

    await this.prisma.webhookDelivery.update({
      where: { uuid: delivery.uuid },
      data: {
        status: WebhookDeliveryStatus.DELIVERED,
        lastStatusCode: response.status,
        lastError: null,
        deliveredAt: new Date()
      }
    });

    return this.toJson({
      mode: "delivered",
      deliveryId: delivery.uuid,
      eventType: delivery.eventType,
      statusCode: response.status,
      attempt
    });
  }

  private async processNotificationDelivery(job: ClaimedJob): Promise<Prisma.InputJsonValue> {
    if (this.notificationDelivery) {
      return this.toJson(await this.notificationDelivery.deliverPendingForJob(job.uuid));
    }
    await this.prisma.notification.updateMany({
      where: { jobId: job.uuid, status: "PENDING" },
      data: { status: "SENT", sentAt: new Date() }
    });
    return this.toJson({
      mode: "notification_records_marked",
      message: "Notification delivery adapter can replace this marker with real push/email/SMS transport."
    });
  }

  private async processRateLimitBucketCleanup(job: ClaimedJob): Promise<Prisma.InputJsonValue> {
    if (!this.rateLimit) {
      throw new Error("Rate limit service is unavailable for bucket cleanup.");
    }
    const payload = this.asRecord(job.payload);
    const olderThanHours = this.asNumber(payload.olderThanHours, 1, 720, 24);
    const result = await this.rateLimit.cleanupExpiredBuckets({ olderThanHours });
    return this.toJson({
      mode: "rate_limit_bucket_cleanup",
      olderThanHours: result.olderThanHours,
      cutoff: result.cutoff.toISOString(),
      deletedBuckets: result.deletedBuckets
    });
  }

  private async processIdempotencyRecordCleanup(job: ClaimedJob): Promise<Prisma.InputJsonValue> {
    const payload = this.asRecord(job.payload);
    const olderThanHours = this.asNumber(payload.olderThanHours, 1, 2160, 24);
    const result = this.idempotency
      ? await this.idempotency.cleanupExpiredRecords({ olderThanHours })
      : await this.cleanupExpiredIdempotencyRecords(olderThanHours);
    return this.toJson({
      mode: "idempotency_record_cleanup",
      olderThanHours: result.olderThanHours,
      cutoff: result.cutoff.toISOString(),
      deletedRecords: result.deletedRecords
    });
  }

  private async cleanupExpiredIdempotencyRecords(olderThanHours: number) {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const result = await this.prisma.idempotencyRecord.deleteMany({
      where: {
        expiresAt: { lt: cutoff }
      }
    });
    return {
      olderThanHours,
      cutoff,
      deletedRecords: result.count
    };
  }

  private async processDeferredIntegration(job: ClaimedJob): Promise<Prisma.InputJsonValue> {
    return this.toJson({
      mode: "deferred_adapter",
      type: job.type,
      message: "Durable worker runtime is ready; this integration-specific processor is intentionally deferred."
    });
  }

  private async completeJob(job: ClaimedJob, result: Prisma.InputJsonValue) {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.backgroundJob.update({
        where: { uuid: job.uuid },
        data: {
          status: BackgroundJobStatus.SUCCEEDED,
          result,
          progress: 100,
          lockedAt: null,
          lockedBy: null,
          completedAt: new Date()
        }
      });

      await tx.domainEvent.create({
        data: {
          type: `${job.type.toLowerCase()}.succeeded`,
          aggregateType: "BackgroundJob",
          aggregateId: job.uuid,
          institutionId: job.institutionId,
          jobId: job.uuid,
          payload: this.toJson({ jobId: job.uuid, type: job.type, result })
        }
      });
    });
  }

  private async failOrRetryJob(job: ClaimedJob, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldRetry = !(error instanceof NonRetryableJobError) && job.attempts < job.maxAttempts;
    const nextRunAfter = shouldRetry ? new Date(Date.now() + this.retryDelayMs(job.attempts)) : undefined;
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.backgroundJob.update({
        where: { uuid: job.uuid },
        data: {
          status: shouldRetry ? BackgroundJobStatus.RETRYING : BackgroundJobStatus.FAILED,
          error: message,
          progress: shouldRetry ? 0 : 100,
          lockedAt: null,
          lockedBy: null,
          runAfter: nextRunAfter,
          failedAt: shouldRetry ? undefined : new Date()
        }
      });

      if (job.type === BackgroundJobType.WEBHOOK_DELIVERY) {
        await tx.webhookDelivery.updateMany({
          where: { jobId: job.uuid, status: { in: [WebhookDeliveryStatus.PENDING, WebhookDeliveryStatus.RETRYING] } },
          data: {
            status: shouldRetry ? WebhookDeliveryStatus.RETRYING : WebhookDeliveryStatus.FAILED,
            lastError: message,
            nextAttemptAt: nextRunAfter ?? new Date()
          }
        });
      }

      await tx.domainEvent.create({
        data: {
          type: shouldRetry ? `${job.type.toLowerCase()}.retrying` : `${job.type.toLowerCase()}.failed`,
          aggregateType: "BackgroundJob",
          aggregateId: job.uuid,
          institutionId: job.institutionId,
          jobId: job.uuid,
          payload: this.toJson({ jobId: job.uuid, type: job.type, error: message, retrying: shouldRetry })
        }
      });
    });

    this.logger.warn(`Job ${job.uuid} ${shouldRetry ? "will retry" : "failed"}: ${message}`);
    void this.observability
      ?.recordWorkerError({
        jobId: job.uuid,
        queue: job.queue,
        type: job.type,
        institutionId: job.institutionId,
        error,
        retrying: shouldRetry
      })
      .catch(() => {
        // Worker failure handling must not fail because observability is unavailable.
      });
  }

  private retryDelayMs(attempts: number) {
    const exponent = Math.max(0, attempts - 1);
    return Math.min(15 * 60 * 1000, 30 * 1000 * 2 ** exponent);
  }

  private serializeWebhookBody(delivery: WebhookDeliveryRecord, attempt: number) {
    return JSON.stringify({
      id: delivery.uuid,
      eventType: delivery.eventType,
      attempt,
      payload: delivery.payload,
      sentAt: new Date().toISOString()
    });
  }

  private buildWebhookHeaders(delivery: WebhookDeliveryRecord, body: string) {
    const secret = this.resolveWebhookSecret(delivery);
    if (!secret) {
      throw new Error("A webhook signing secret is required before webhook delivery can run.");
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedContent = `${timestamp}.${delivery.uuid}.${body}`;
    const signature = createHmac("sha256", secret).update(signedContent).digest("hex");

    return {
      "content-type": "application/json",
      "user-agent": "AcadID-Webhook/1.0",
      "x-acadid-event": delivery.eventType,
      "x-acadid-delivery": delivery.uuid,
      ...(delivery.webhookEndpoint ? { "x-acadid-webhook-endpoint": delivery.webhookEndpoint.uuid } : {}),
      "x-acadid-idempotency-key": `whd_${delivery.uuid}`,
      "x-acadid-timestamp": timestamp,
      "x-acadid-signature": `v1=${signature}`
    };
  }

  private resolveWebhookSecret(delivery: WebhookDeliveryRecord) {
    if (delivery.webhookEndpoint) {
      if (delivery.webhookEndpoint.status !== "ACTIVE") {
        throw new Error(`Webhook endpoint ${delivery.webhookEndpoint.uuid} is not active.`);
      }
      if (!this.webhookSecrets) {
        throw new Error("Webhook secret service is unavailable.");
      }
      return this.webhookSecrets.decrypt(delivery.webhookEndpoint.secretEncrypted);
    }
    return process.env.ACADID_WEBHOOK_SECRET;
  }

  private webhookTimeoutMs() {
    const configured = Number(process.env.ACADID_WEBHOOK_TIMEOUT_MS ?? "10000");
    if (!Number.isFinite(configured) || configured < 1000) {
      return 10000;
    }
    return Math.min(configured, 30000);
  }

  private systemAuth(job: ClaimedJob): AuthTokenPayload {
    return {
      sub: job.createdById ?? "acadid-worker",
      email: "worker@acadid.internal",
      fullName: "AcadID Background Worker",
      role: UserRole.ACADID_SUPER_ADMIN,
      kind: "USER",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private asNumber(value: unknown, min: number, max: number, fallback: number) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }

  private isMetadataOnlyUpload(request: Record<string, unknown>) {
    return (
      !request.csvText &&
      !request.contentBase64 &&
      !request.filePath &&
      typeof request.storageUrl === "string" &&
      request.storageUrl.startsWith("pending://")
    );
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private defaultWorkerId() {
    return `${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "acadid"}-${process.pid}`;
  }
}
