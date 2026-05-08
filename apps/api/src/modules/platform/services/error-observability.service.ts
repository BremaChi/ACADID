import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AuditService } from "./audit.service.js";
import { StructuredLoggerService } from "./structured-logger.service.js";

type HttpErrorInput = {
  requestId: string;
  route: string;
  method?: string;
  statusCode: number;
  durationMs: number;
  error: unknown;
  actorType?: "USER" | "API_KEY" | "SYSTEM" | "ANONYMOUS";
  actorId?: string;
  actorRole?: string;
  clientId?: string;
  institutionId?: string;
};

type WorkerErrorInput = {
  jobId: string;
  queue: string;
  type: string;
  institutionId?: string | null;
  error: unknown;
  retrying: boolean;
};

@Injectable()
export class ErrorObservabilityService {
  constructor(
    private readonly audit: AuditService,
    private readonly logger: StructuredLoggerService
  ) {}

  async recordHttpError(input: HttpErrorInput) {
    const error = this.normaliseError(input.error);
    this.logger.error({
      event: "http.error",
      message: error.message,
      requestId: input.requestId,
      actorType: input.actorType,
      actorId: input.actorId,
      clientId: input.clientId,
      institutionId: input.institutionId,
      route: input.route,
      method: input.method,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      metadata: {
        errorName: error.name,
        stack: process.env.NODE_ENV === "production" ? undefined : error.stack
      }
    });

    await this.audit.write({
      requestId: input.requestId,
      actorType: input.actorType,
      actorUserId: input.actorId,
      clientId: input.clientId,
      actorId: input.actorId,
      actorRole: input.actorRole as never,
      institutionId: input.institutionId,
      role: input.actorRole,
      endpoint: input.route,
      httpMethod: input.method,
      action: "error.observed",
      targetType: "GatewayEndpoint",
      targetId: input.route,
      entityType: "GatewayEndpoint",
      entityId: input.route,
      outcome: "FAILED",
      reason: error.message,
      metadata: {
        statusCode: input.statusCode,
        durationMs: input.durationMs,
        errorName: error.name
      } satisfies Prisma.InputJsonObject
    });
  }

  async recordWorkerError(input: WorkerErrorInput) {
    const error = this.normaliseError(input.error);
    this.logger.error({
      event: "worker.error",
      message: error.message,
      jobId: input.jobId,
      queue: input.queue,
      institutionId: input.institutionId ?? undefined,
      metadata: {
        type: input.type,
        retrying: input.retrying,
        errorName: error.name,
        stack: process.env.NODE_ENV === "production" ? undefined : error.stack
      }
    });

    await this.audit.write({
      actorType: "SYSTEM",
      institutionId: input.institutionId ?? undefined,
      action: "worker.error",
      targetType: "BackgroundJob",
      targetId: input.jobId,
      entityType: "BackgroundJob",
      entityId: input.jobId,
      outcome: "FAILED",
      reason: error.message,
      metadata: {
        type: input.type,
        queue: input.queue,
        retrying: input.retrying,
        errorName: error.name
      } satisfies Prisma.InputJsonObject
    });
  }

  private normaliseError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: this.safeMessage(error.message),
        stack: error.stack?.slice(0, 2000)
      };
    }
    return {
      name: "Error",
      message: this.safeMessage(String(error)),
      stack: undefined
    };
  }

  private safeMessage(message: string) {
    return message.replace(/(password|secret|token|authorization|credential)=\S+/gi, "$1=[REDACTED]").slice(0, 300);
  }
}
