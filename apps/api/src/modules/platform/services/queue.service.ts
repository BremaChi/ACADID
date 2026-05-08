import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { BackgroundJobType, NotificationChannel, Prisma, UserRole } from "@prisma/client";
import type { AuthTokenPayload } from "../../auth/types.js";
import { AuthorityService } from "./authority.service.js";
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
  EXAM_BODY_INGEST: "exam-body.ingest"
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
}

export interface EnqueueWebhookInput {
  jobId?: string;
  eventId?: string;
  institutionId?: string;
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
    private readonly authority: AuthorityService
  ) {}

  async enqueueJob(input: EnqueueJobInput) {
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
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        jobId: input.jobId,
        eventId: input.eventId,
        institutionId: input.institutionId,
        targetUrl: input.targetUrl,
        eventType: input.eventType,
        payload: input.payload
      }
    });

    return {
      id: delivery.uuid,
      status: delivery.status,
      eventType: delivery.eventType,
      nextAttemptAt: delivery.nextAttemptAt
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
}
