import { Injectable, Logger } from "@nestjs/common";
import { BackgroundJobStatus, BackgroundJobType, Prisma, UserRole } from "@prisma/client";
import type { AuthTokenPayload } from "../auth/types.js";
import { IngestionService } from "../gateway/ingestion/ingestion.service.js";
import { PrismaService } from "../platform/services/prisma.service.js";

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
  "exam-body.ingest"
];

@Injectable()
export class JobWorkerService {
  private readonly logger = new Logger(JobWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService
  ) {}

  async runOnce(workerId = this.defaultWorkerId(), batchSize = 5): Promise<WorkerRunResult> {
    const result: WorkerRunResult = { processed: 0, succeeded: 0, failed: 0 };

    for (let index = 0; index < batchSize; index += 1) {
      const job = await this.claimNextJob(workerId);
      if (!job) {
        break;
      }

      result.processed += 1;
      try {
        const processorResult = await this.processJob(job);
        await this.completeJob(job, processorResult);
        result.succeeded += 1;
      } catch (error) {
        await this.failOrRetryJob(job, error);
        result.failed += 1;
      }
    }

    return result;
  }

  async startLoop(options: { workerId?: string; intervalMs?: number; batchSize?: number; once?: boolean } = {}) {
    const workerId = options.workerId ?? this.defaultWorkerId();
    const intervalMs = options.intervalMs ?? 5000;
    const batchSize = options.batchSize ?? 5;

    this.logger.log(`AcadID worker started as ${workerId}`);
    do {
      const result = await this.runOnce(workerId, batchSize);
      if (options.once) {
        return result;
      }
      if (result.processed === 0) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    } while (true);
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
    }
  }

  private async processBulkStudentUpload(job: ClaimedJob): Promise<Prisma.InputJsonValue> {
    const payload = this.asRecord(job.payload);
    const request = this.asRecord(payload.request);
    if (Array.isArray(request.rows) && request.rows.length > 0) {
      const result = await this.ingestion.ingestStudents(this.systemAuth(job), request);
      return this.toJson({
        mode: "processed_rows",
        createdLearners: result.createdLearners,
        linkedLearners: result.linkedLearners,
        createdEnrolments: result.createdEnrolments,
        existingEnrolments: result.existingEnrolments,
        rowCount: result.rows.length
      });
    }

    return this.toJson({
      mode: "metadata_only",
      message: "Bulk upload job accepted. File parser/import worker can attach parsed rows in the next phase.",
      fileName: request.fileName ?? null,
      uploadType: request.uploadType ?? null,
      storageUrl: request.storageUrl ?? null
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
    await this.prisma.webhookDelivery.updateMany({
      where: { jobId: job.uuid, status: { in: ["PENDING", "RETRYING"] } },
      data: { status: "RETRYING", attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 60000) }
    });
    return this.toJson({
      mode: "delivery_scheduled",
      message: "Webhook transport adapter is queued for the next phase."
    });
  }

  private async processNotificationDelivery(job: ClaimedJob): Promise<Prisma.InputJsonValue> {
    await this.prisma.notification.updateMany({
      where: { jobId: job.uuid, status: "PENDING" },
      data: { status: "SENT", sentAt: new Date() }
    });
    return this.toJson({
      mode: "notification_records_marked",
      message: "Notification delivery adapter can replace this marker with real push/email/SMS transport."
    });
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
    const shouldRetry = job.attempts < job.maxAttempts;
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.backgroundJob.update({
        where: { uuid: job.uuid },
        data: {
          status: shouldRetry ? BackgroundJobStatus.RETRYING : BackgroundJobStatus.FAILED,
          error: message,
          progress: shouldRetry ? 0 : 100,
          lockedAt: null,
          lockedBy: null,
          runAfter: shouldRetry ? new Date(Date.now() + this.retryDelayMs(job.attempts)) : undefined,
          failedAt: shouldRetry ? undefined : new Date()
        }
      });

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
  }

  private retryDelayMs(attempts: number) {
    return Math.min(15 * 60 * 1000, Math.max(30 * 1000, attempts * 60 * 1000));
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

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private defaultWorkerId() {
    return `${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "acadid"}-${process.pid}`;
  }
}
