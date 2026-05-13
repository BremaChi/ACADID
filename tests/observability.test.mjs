import assert from "node:assert/strict";
import test from "node:test";
import { ErrorObservabilityService } from "../apps/api/dist/apps/api/src/modules/platform/services/error-observability.service.js";
import { StructuredLoggerService } from "../apps/api/dist/apps/api/src/modules/platform/services/structured-logger.service.js";

test("structured logger emits JSON logs and redacts sensitive metadata", () => {
  const lines = [];
  const logger = new StructuredLoggerService();
  logger.setSink((line) => lines.push(line));

  logger.info({
    event: "test.event",
    message: "test message",
    requestId: "req-1",
    metadata: {
      nested: {
        password: "plaintext",
        accessToken: "secret-token",
        safeValue: "visible"
      }
    }
  });

  assert.equal(lines.length, 1);
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.level, "info");
  assert.equal(payload.event, "test.event");
  assert.equal(payload.requestId, "req-1");
  assert.equal(payload.metadata.nested.password, "[REDACTED]");
  assert.equal(payload.metadata.nested.accessToken, "[REDACTED]");
  assert.equal(payload.metadata.nested.safeValue, "visible");
});

test("structured logger can mirror redacted logs to an external HTTP sink", async () => {
  const previousUrl = process.env.ACADID_LOG_SINK_URL;
  const previousToken = process.env.ACADID_LOG_SINK_BEARER_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.ACADID_LOG_SINK_URL = "https://logs.example.test/ingest";
  process.env.ACADID_LOG_SINK_BEARER_TOKEN = "sink-token";
  const mirrored = [];
  globalThis.fetch = async (url, init) => {
    mirrored.push({ url: String(url), authorization: init.headers.authorization, body: JSON.parse(init.body) });
    return new Response("ok", { status: 202 });
  };

  try {
    const logger = new StructuredLoggerService();
    logger.setSink(() => undefined);
    logger.error({
      event: "test.external",
      message: "external message",
      metadata: {
        clientSecret: "secret-value",
        safe: "visible"
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(mirrored.length, 1);
    assert.equal(mirrored[0].url, "https://logs.example.test/ingest");
    assert.equal(mirrored[0].authorization, "Bearer sink-token");
    assert.equal(mirrored[0].body.metadata.clientSecret, "[REDACTED]");
    assert.equal(mirrored[0].body.metadata.safe, "visible");
    assert.equal(logger.externalSinkStatus().configured, true);
    assert.equal(logger.externalSinkStatus().delivered, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.ACADID_LOG_SINK_URL;
    else process.env.ACADID_LOG_SINK_URL = previousUrl;
    if (previousToken === undefined) delete process.env.ACADID_LOG_SINK_BEARER_TOKEN;
    else process.env.ACADID_LOG_SINK_BEARER_TOKEN = previousToken;
  }
});

test("error observability records worker failures as logs and audit events", async () => {
  const auditEvents = [];
  const lines = [];
  const logger = new StructuredLoggerService();
  logger.setSink((line) => lines.push(line));
  const service = new ErrorObservabilityService(
    {
      write: async (event) => {
        auditEvents.push(event);
      }
    },
    logger
  );

  await service.recordWorkerError({
    jobId: "job-1",
    queue: "ingestion.bulk",
    type: "BULK_STUDENT_UPLOAD",
    institutionId: "institution-1",
    error: new Error("secret=my-secret failed"),
    retrying: true
  });

  const log = JSON.parse(lines[0]);
  assert.equal(log.event, "worker.error");
  assert.equal(log.jobId, "job-1");
  assert.equal(log.message, "secret=[REDACTED] failed");
  assert.equal(auditEvents[0].action, "worker.error");
  assert.equal(auditEvents[0].outcome, "FAILED");
  assert.equal(auditEvents[0].metadata.retrying, true);
  assert.equal(auditEvents[0].targetId, "job-1");
  assert.equal(auditEvents[0].reason, "secret=[REDACTED] failed");
});

test("error observability records HTTP failures with request context", async () => {
  const auditEvents = [];
  const lines = [];
  const logger = new StructuredLoggerService();
  logger.setSink((line) => lines.push(line));
  const service = new ErrorObservabilityService(
    {
      write: async (event) => {
        auditEvents.push(event);
      }
    },
    logger
  );

  await service.recordHttpError({
    requestId: "req-2",
    route: "/verify/credential",
    method: "POST",
    statusCode: 500,
    durationMs: 42,
    error: new Error("token=abc123 failed"),
    actorType: "API_KEY",
    clientId: "client-1",
    institutionId: "institution-1"
  });

  const log = JSON.parse(lines[0]);
  assert.equal(log.event, "http.error");
  assert.equal(log.requestId, "req-2");
  assert.equal(log.message, "token=[REDACTED] failed");
  assert.equal(log.clientId, "client-1");
  assert.equal(auditEvents[0].action, "error.observed");
  assert.equal(auditEvents[0].outcome, "FAILED");
  assert.equal(auditEvents[0].endpoint, "/verify/credential");
  assert.equal(auditEvents[0].metadata.statusCode, 500);
});
