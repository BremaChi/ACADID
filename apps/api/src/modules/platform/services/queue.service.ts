import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { BackgroundJobType, NotificationChannel, Prisma, UserRole } from "@prisma/client";
import type { AuthTokenPayload } from "../../auth/types.js";
import { AuthorityService } from "./authority.service.js";
import { IdempotencyService } from "./idempotency.service.js";
import { PrismaService } from "./prisma.service.js";

const queueByJobType: Record<BackgroundJobType, string> = {
  BULK_STUDENT_UPLOAD: "ingestion.bulk",
  RESULT_BATCH_VALIDATION: "results.validation",
  CREDENTIAL_GENERATION: "credentials.generation",
  PDF_GENERATION: "documents.pdf",
  SMS_EMAIL_DELIVERY: "notifications.delivery",
  PAYSTACK_PAYMENT_CONFIRMATION: "payments.paystack",
  RECORD_REQUEST_DEADLINE: "record-requests.deadlines",
  WEBHOOK_DELIVERY: "webhooks.delivery",
  PUSH_NOTIFICATION: "notifications.push",
  LIVE_RESULTS_CALLBACK: "live-results.callbacks",
  EXAM_BODY_INGEST: "exam-body.ingest",
  RATE_LIMIT_BUCKET_CLEANUP: "platform.maintenance",
  IDEMPOTENCY_RECORD_CLEANUP: "platform.maintenance"
};

export interface EnqueueJobInput {
  type: BackgroundJobType;
  queue?: string;
  institutionId?: string;
  createdById?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  priority?: number;
  maxAttempts?: number;
  runAfter?: Date;
  payload: Prisma.InputJsonValue;
  eventType?: string;
  eventPayload?: Prisma.InputJsonValue;
  idempotencyKey?: string;
  idempotencyScope?: string;
  idempotencyTtlHours?: number;
}

export interface EnqueueWebhookInput {
  jobId?: string;
  eventId?: string;
  institutionId?: string;
  webhookEndpointId?: string;
  targetUrl: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
}

export interface EnqueueNotificationInput {
  jobId?: string;
  institutionId?: string;
  learnerId?: string;
  userId?: string;
  channel: NotificationChannel;
  type: string;
  title: string;
  body: string;
  payload?: Prisma.InputJsonValue;
}

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: AuthorityService,
    private readonly idempotency?: IdempotencyService
  ) {}

  async enqueueJob(input: EnqueueJobInput) {
    const idempotencyKey = input.idempotencyKey ?? this.autoIdempotencyKey(input);
    if (idempotencyKey && this.idempotency) {
      return this.idempotency.execute({
        scope: input.idempotencyScope ?? `job:${input.type}`,
        key: idempotencyKey,
        operation: input.eventType ?? `${input.type.toLowerCase()}.queued`,
        request: {
          type: input.type,
          institutionId: input.institutionId ?? null,
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
          payload: input.payload
        },
        institutionId: input.institutionId,
        ttlHours: input.idempotencyTtlHours,
        handler: () => this.createJob(input),
        responseJobId: (response) => response.jobId
      });
    }

    return this.createJob(input);
  }

  private async createJob(input: EnqueueJobInput) {
    const job = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdJob = await tx.backgroundJob.create({
        data: {
          type: input.type,
          queue: input.queue ?? queueByJobType[input.type],
          institutionId: input.institutionId,
          createdById: input.createdById,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
          priority: input.priority ?? 0,
          maxAttempts: input.maxAttempts ?? 3,
          runAfter: input.runAfter ?? new Date(),
          payload: input.payload
        }
      });

      const event = await tx.domainEvent.create({
        data: {
          type: input.eventType ?? `${input.type.toLowerCase()}.queued`,
          aggregateType: "BackgroundJob",
          aggregateId: createdJob.uuid,
          institutionId: input.institutionId,
          jobId: createdJob.uuid,
          payload:
            input.eventPayload ??
            ({
              jobId: createdJob.uuid,
              type: input.type,
              queue: createdJob.queue,
              status: createdJob.status
            } satisfies Prisma.InputJsonObject)
        }
      });

      return { ...createdJob, eventId: event.uuid };
    });

    return this.toJobAcceptedResponse(job);
  }

  async enqueueWebhookDelivery(input: EnqueueWebhookInput) {
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const job = await tx.backgroundJob.create({
        data: {
          type: BackgroundJobType.WEBHOOK_DELIVERY,
          queue: queueByJobType.WEBHOOK_DELIVERY,
          institutionId: input.institutionId,
          relatedEntityType: "WebhookDelivery",
          priority: 1,
          maxAttempts: 8,
          payload: {
            eventId: input.eventId ?? null,
            sourceJobId: input.jobId ?? null,
            webhookEndpointId: input.webhookEndpointId ?? null,
            targetUrl: input.targetUrl,
            eventType: input.eventType
          }
        }
      });

      const event = await tx.domainEvent.create({
        data: {
          type: `${input.eventType}.webhook_queued`,
          aggregateType: "WebhookDelivery",
          aggregateId: job.uuid,
          institutionId: input.institutionId,
          jobId: job.uuid,
          payload: {
            jobId: job.uuid,
            sourceJobId: input.jobId ?? null,
            webhookEndpointId: input.webhookEndpointId ?? null,
            targetUrl: input.targetUrl,
            eventType: input.eventType
          }
        }
      });

      const delivery = await tx.webhookDelivery.create({
        data: {
          jobId: job.uuid,
          eventId: input.eventId ?? event.uuid,
          institutionId: input.institutionId,
          webhookEndpointId: input.webhookEndpointId,
          targetUrl: input.targetUrl,
          eventType: input.eventType,
          payload: input.payload
        }
      });

      await tx.backgroundJob.update({
        where: { uuid: job.uuid },
        data: {
          relatedEntityId: delivery.uuid,
          payload: {
            eventId: input.eventId ?? null,
            queueEventId: event.uuid,
            sourceJobId: input.jobId ?? null,
            deliveryId: delivery.uuid,
            webhookEndpointId: input.webhookEndpointId ?? null,
            targetUrl: input.targetUrl,
            eventType: input.eventType
          }
        }
      });

      return { job, event, delivery };
    });

    return {
      id: result.delivery.uuid,
      jobId: result.job.uuid,
      eventId: result.event.uuid,
      status: result.delivery.status,
      eventType: result.delivery.eventType,
      idempotencyKey: `whd_${result.delivery.uuid}`,
      nextAttemptAt: result.delivery.nextAttemptAt,
      pollingUrl: `/jobs/${result.job.uuid}`
    };
  }

  async enqueueNotification(input: EnqueueNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: {
        jobId: input.jobId,
        institutionId: input.institutionId,
        learnerId: input.learnerId,
        userId: input.userId,
        channel: input.channel,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload
      }
    });

    return {
      id: notification.uuid,
      status: notification.status,
      channel: notification.channel,
      type: notification.type
    };
  }

  async readJob(auth: AuthTokenPayload, id: string) {
    const job = await this.prisma.backgroundJob.findUnique({
      where: { uuid: id },
      select: {
        uuid: true,
        type: true,
        queue: true,
        status: true,
        institutionId: true,
        createdById: true,
        relatedEntityType: true,
        relatedEntityId: true,
        priority: true,
        progress: true,
        attempts: true,
        maxAttempts: true,
        result: true,
        error: true,
        runAfter: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
        createdAt: true,
        updatedAt: true,
        domainEvents: {
          select: { uuid: true, type: true, status: true, attempts: true, publishedAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10
        },
        notifications: {
          select: { uuid: true, channel: true, type: true, status: true, sentAt: true, failedAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10
        }
      }
    });

    if (!job) {
      throw new BadRequestException("Job not found.");
    }

    await this.assertCanReadJob(auth, job);

    return {
      id: job.uuid,
      type: job.type,
      queue: job.queue,
      status: job.status,
      progress: job.progress,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      relatedEntityType: job.relatedEntityType,
      relatedEntityId: job.relatedEntityId,
      result: job.result,
      error: job.error,
      runAfter: job.runAfter,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      failedAt: job.failedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      events: job.domainEvents,
      notifications: job.notifications
    };
  }

  private async assertCanReadJob(
    auth: AuthTokenPayload,
    job: { institutionId: string | null; createdById: string | null }
  ) {
    if (auth.role === UserRole.ACADID_SUPER_ADMIN) {
      return;
    }

    if (job.institutionId) {
      await this.authority.assertActorCanOperateInstitution(auth, job.institutionId);
      return;
    }

    if (auth.kind !== "API_KEY" && job.createdById === auth.sub) {
      return;
    }

    throw new ForbiddenException("You do not have access to this job.");
  }

  private toJobAcceptedResponse(job: { uuid: string; type: BackgroundJobType; queue: string; status: string; eventId: string }) {
    return {
      id: job.uuid,
      jobId: job.uuid,
      type: job.type,
      queue: job.queue,
      status: job.status,
      eventId: job.eventId,
      pollingUrl: `/jobs/${job.uuid}`
    };
  }

  private autoIdempotencyKey(input: EnqueueJobInput) {
    const protectedTypes = new Set<BackgroundJobType>([
      BackgroundJobType.BULK_STUDENT_UPLOAD,
      BackgroundJobType.RESULT_BATCH_VALIDATION,
      BackgroundJobType.CREDENTIAL_GENERATION,
      BackgroundJobType.PDF_GENERATION,
      BackgroundJobType.PAYSTACK_PAYMENT_CONFIRMATION
    ]);
    if (!protectedTypes.has(input.type)) {
      return undefined;
    }
    return `auto:${this.hash(this.stableStringify({
      type: input.type,
      institutionId: input.institutionId ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      payload: input.payload
    }))}`;
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((entry) => this.stableStringify(entry)).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${this.stableStringify(entry)}`).join(",")}}`;
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
}
