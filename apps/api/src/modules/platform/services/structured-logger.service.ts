import { Injectable } from "@nestjs/common";

type LogLevel = "info" | "warn" | "error";

type StructuredLogInput = {
  level: LogLevel;
  event: string;
  message: string;
  requestId?: string;
  actorType?: string;
  actorId?: string;
  clientId?: string;
  institutionId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  jobId?: string;
  queue?: string;
  metadata?: unknown;
};

type LogSink = (line: string) => void;

const sensitiveKeyPattern = /(password|secret|token|authorization|cookie|credential|privatekey|recoverycode|nin|bvn)/i;

@Injectable()
export class StructuredLoggerService {
  private sink: LogSink = (line) => console.log(line);

  setSink(sink: LogSink) {
    this.sink = sink;
  }

  info(input: Omit<StructuredLogInput, "level">) {
    this.write({ ...input, level: "info" });
  }

  warn(input: Omit<StructuredLogInput, "level">) {
    this.write({ ...input, level: "warn" });
  }

  error(input: Omit<StructuredLogInput, "level">) {
    this.write({ ...input, level: "error" });
  }

  write(input: StructuredLogInput) {
    this.sink(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "acadid-api",
        level: input.level,
        event: input.event,
        message: input.message,
        requestId: input.requestId,
        actorType: input.actorType,
        actorId: input.actorId,
        clientId: input.clientId,
        institutionId: input.institutionId,
        route: input.route,
        method: input.method,
        statusCode: input.statusCode,
        durationMs: input.durationMs,
        jobId: input.jobId,
        queue: input.queue,
        metadata: this.redact(input.metadata)
      })
    );
  }

  redact(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }
    if (!value || typeof value !== "object") {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, sensitiveKeyPattern.test(key) ? "[REDACTED]" : this.redact(child)])
    );
  }
}
