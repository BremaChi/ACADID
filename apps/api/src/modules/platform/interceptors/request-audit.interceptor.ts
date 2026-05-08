import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Optional } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { catchError, tap, throwError } from "rxjs";
import type { Observable } from "rxjs";
import { AuditService } from "../services/audit.service.js";
import { ErrorObservabilityService } from "../services/error-observability.service.js";
import { StructuredLoggerService } from "../services/structured-logger.service.js";
import type { AuthenticatedRequest } from "../../auth/types.js";

type HttpRequest = AuthenticatedRequest & {
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
};

type HttpResponse = {
  statusCode?: number;
  setHeader?: (name: string, value: string) => void;
};

@Injectable()
export class RequestAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    @Optional() private readonly logger?: StructuredLoggerService,
    @Optional() private readonly errors?: ErrorObservabilityService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    const requestId = this.resolveRequestId(request);
    const startedAt = Date.now();
    response?.setHeader?.("x-request-id", requestId);

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - startedAt;
        this.writeGatewayAudit(request, requestId, "SUCCESS", response?.statusCode, undefined, durationMs);
        this.writeStructuredRequestLog(request, requestId, "SUCCESS", response?.statusCode, durationMs);
      }),
      catchError((error: unknown) => {
        const statusCode = this.statusCodeFromError(error);
        const outcome = statusCode === 401 || statusCode === 403 ? "DENIED" : "FAILED";
        const durationMs = Date.now() - startedAt;
        this.writeGatewayAudit(request, requestId, outcome, statusCode, error, durationMs);
        this.writeStructuredRequestLog(request, requestId, outcome, statusCode, durationMs, error);
        this.writeObservedError(request, requestId, statusCode, durationMs, error);
        return throwError(() => error);
      })
    );
  }

  private writeGatewayAudit(
    request: HttpRequest,
    requestId: string,
    outcome: "SUCCESS" | "DENIED" | "FAILED",
    statusCode?: number,
    error?: unknown,
    durationMs?: number
  ) {
    const auth = request.auth;
    const endpoint = this.normaliseEndpoint(request);
    const actorType = auth?.kind === "API_KEY" ? "API_KEY" : auth ? "USER" : "ANONYMOUS";

    void this.audit
      .write({
        requestId,
        actorType,
        actorUserId: auth?.kind === "API_KEY" ? undefined : auth?.sub,
        clientId: auth?.kind === "API_KEY" ? auth.clientId : undefined,
        actorId: auth?.kind === "API_KEY" ? undefined : auth?.sub,
        actorRole: auth?.role,
        institutionId: auth?.institutionUuid,
        role: auth?.role,
        endpoint,
        httpMethod: request.method,
        action: "gateway.request",
        targetType: "GatewayEndpoint",
        targetId: endpoint,
        entityType: "GatewayEndpoint",
        entityId: endpoint,
        outcome,
        reason: this.safeErrorMessage(error),
        ipAddressHash: this.hashHeader(this.clientIp(request)),
        userAgentHash: this.hashHeader(this.headerValue(request.headers["user-agent"])),
        metadata: {
          statusCode,
          durationMs,
          sessionId: auth?.kind === "API_KEY" ? undefined : auth?.sessionId,
          apiKeyId: auth?.apiKeyId,
          apiKeyOwnerType: auth?.apiKeyOwnerType,
          productCode: auth?.productCode,
          environment: auth?.environment
        }
      })
      .catch(() => {
        // Gateway responses must not fail because the audit writer is unavailable.
      });
  }

  private writeStructuredRequestLog(
    request: HttpRequest,
    requestId: string,
    outcome: "SUCCESS" | "DENIED" | "FAILED",
    statusCode?: number,
    durationMs?: number,
    error?: unknown
  ) {
    const auth = request.auth;
    const endpoint = this.normaliseEndpoint(request);
    const actorType = auth?.kind === "API_KEY" ? "API_KEY" : auth ? "USER" : "ANONYMOUS";
    const payload = {
      event: "gateway.request",
      message: `${request.method ?? "HTTP"} ${endpoint} ${outcome.toLowerCase()}`,
      requestId,
      actorType,
      actorId: auth?.kind === "API_KEY" ? undefined : auth?.sub,
      clientId: auth?.kind === "API_KEY" ? auth.clientId : undefined,
      institutionId: auth?.institutionUuid,
      route: endpoint,
      method: request.method,
      statusCode,
      durationMs,
      metadata: {
        outcome,
        error: this.safeErrorMessage(error),
        apiKeyOwnerType: auth?.apiKeyOwnerType,
        productCode: auth?.productCode,
        environment: auth?.environment
      }
    };

    if (outcome === "SUCCESS") {
      this.logger?.info(payload);
      return;
    }
    if (outcome === "DENIED") {
      this.logger?.warn(payload);
      return;
    }
    this.logger?.error(payload);
  }

  private writeObservedError(request: HttpRequest, requestId: string, statusCode: number, durationMs: number, error: unknown) {
    const auth = request.auth;
    void this.errors
      ?.recordHttpError({
        requestId,
        route: this.normaliseEndpoint(request),
        method: request.method,
        statusCode,
        durationMs,
        error,
        actorType: auth?.kind === "API_KEY" ? "API_KEY" : auth ? "USER" : "ANONYMOUS",
        actorId: auth?.kind === "API_KEY" ? undefined : auth?.sub,
        actorRole: auth?.role,
        clientId: auth?.kind === "API_KEY" ? auth.clientId : undefined,
        institutionId: auth?.institutionUuid
      })
      .catch(() => {
        // Observability must never break the HTTP response path.
      });
  }

  private resolveRequestId(request: HttpRequest) {
    const existing = this.headerValue(request.headers["x-request-id"]);
    return existing && existing.length <= 120 ? existing : randomUUID();
  }

  private normaliseEndpoint(request: HttpRequest) {
    return (request.originalUrl ?? request.url ?? "unknown").split("?")[0] || "unknown";
  }

  private clientIp(request: HttpRequest) {
    return this.headerValue(request.headers["x-forwarded-for"])?.split(",")[0]?.trim() ?? request.ip ?? request.socket?.remoteAddress;
  }

  private headerValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }

  private hashHeader(value?: string) {
    if (!value) {
      return undefined;
    }
    return createHash("sha256").update(value).digest("hex");
  }

  private statusCodeFromError(error: unknown) {
    if (typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number") {
      return (error as { status: number }).status;
    }
    if (typeof error === "object" && error && "statusCode" in error && typeof (error as { statusCode?: unknown }).statusCode === "number") {
      return (error as { statusCode: number }).statusCode;
    }
    return 500;
  }

  private safeErrorMessage(error: unknown) {
    if (!error) {
      return undefined;
    }
    if (typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message.slice(0, 300);
    }
    return "Request failed.";
  }
}
