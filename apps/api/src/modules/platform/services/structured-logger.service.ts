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
  private readonly externalSink = this.createExternalSink();

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
    const line = JSON.stringify({
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
    });
    this.sink(line);
    void this.externalSink?.write(line);
  }

  externalSinkStatus() {
    return this.externalSink?.status() ?? {
      configured: false,
      provider: "console",
      endpointHost: null,
      lastStatusCode: null,
      lastError: null,
      delivered: 0,
      failed: 0
    };
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

  private createExternalSink() {
    const url = process.env.ACADID_LOG_SINK_URL?.trim();
    if (!url) {
      return null;
    }
    return new HttpStructuredLogSink(url, process.env.ACADID_LOG_SINK_BEARER_TOKEN, Number(process.env.ACADID_LOG_SINK_TIMEOUT_MS ?? 1000));
  }
}

class HttpStructuredLogSink {
  private delivered = 0;
  private failed = 0;
  private lastStatusCode: number | null = null;
  private lastError: string | null = null;
  private readonly endpointHost: string | null;

  constructor(
    private readonly url: string,
    private readonly bearerToken: string | undefined,
    private readonly timeoutMs: number
  ) {
    try {
      this.endpointHost = new URL(url).host;
    } catch {
      this.endpointHost = null;
    }
  }

  async write(line: string) {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {})
        },
        body: line,
        signal: AbortSignal.timeout(this.safeTimeoutMs())
      });
      this.lastStatusCode = response.status;
      if (response.ok) {
        this.delivered += 1;
        this.lastError = null;
      } else {
        this.failed += 1;
        this.lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      this.failed += 1;
      this.lastError = error instanceof Error ? error.message.slice(0, 120) : "Log sink delivery failed.";
    }
  }

  status() {
    return {
      configured: true,
      provider: "http",
      endpointHost: this.endpointHost,
      lastStatusCode: this.lastStatusCode,
      lastError: this.lastError,
      delivered: this.delivered,
      failed: this.failed
    };
  }

  private safeTimeoutMs() {
    return Number.isFinite(this.timeoutMs) ? Math.min(5000, Math.max(250, Math.floor(this.timeoutMs))) : 1000;
  }
}
