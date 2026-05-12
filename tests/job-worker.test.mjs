import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { JobWorkerService } from "../apps/api/dist/apps/api/src/modules/jobs/job-worker.service.js";
import { WebhookSecretService } from "../apps/api/dist/apps/api/src/modules/platform/services/webhook-secret.service.js";

test("worker leases one queued job and completes it with a domain event", async () => {
  const calls = [];
  const service = new JobWorkerService(
    {
      $transaction: async (callback) =>
        callback({
          $queryRaw: async () => [{ uuid: "job-1" }],
          backgroundJob: {
            update: async ({ where, data, select }) => {
              calls.push({ table: "BackgroundJob", where, data });
              if (select) {
                return {
                  uuid: "job-1",
                  type: "BULK_STUDENT_UPLOAD",
                  queue: "ingestion.bulk",
                  institutionId: "institution-1",
                  createdById: "founder-1",
                  payload: {
                    request: {
                      institutionId: "AINi-00001",
                      fileName: "students.csv",
                      uploadType: "student_register",
                      storageUrl: "pending://students.csv"
                    }
                  },
                  attempts: 1,
                  maxAttempts: 3
                };
              }
              return { uuid: where.uuid };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              calls.push({ table: "DomainEvent", data });
              return { uuid: "event-1", ...data };
            }
          }
        })
    },
    {
      ingestStudents: async () => {
        throw new Error("metadata-only bulk uploads should not call row ingestion");
      }
    },
    {
      parseStudentUpload: async () => {
        throw new Error("metadata-only bulk uploads should not call parser");
      }
    }
  );

  const result = await service.runOnce("worker-test", 1);

  assert.deepEqual(result, { processed: 1, succeeded: 1, failed: 0 });
  assert.equal(calls[0].data.status, "RUNNING");
  assert.equal(calls[1].data.status, "SUCCEEDED");
  assert.equal(calls[1].data.progress, 100);
  assert.equal(calls[2].table, "DomainEvent");
  assert.equal(calls[2].data.type, "bulk_student_upload.succeeded");
});

test("worker records heartbeat state for production worker registry", async () => {
  const heartbeats = [];
  const service = new JobWorkerService(
    {
      workerHeartbeat: {
        upsert: async (args) => {
          heartbeats.push(args);
          return args.update;
        }
      },
      $transaction: async (callback) =>
        callback({
          $queryRaw: async () => [],
          backgroundJob: {
            update: async () => {
              throw new Error("no job should be claimed");
            }
          }
        })
    },
    {},
    {}
  );

  const result = await service.runOnce("worker-heartbeat-test", 3);

  assert.deepEqual(result, { processed: 0, succeeded: 0, failed: 0 });
  assert.equal(heartbeats.length, 2);
  assert.equal(heartbeats[0].where.workerId, "worker-heartbeat-test");
  assert.equal(heartbeats[0].create.status, "ACTIVE");
  assert.equal(heartbeats[0].create.concurrency, 3);
  assert.equal(Array.isArray(heartbeats[0].create.queues), true);
  assert.equal(heartbeats[0].create.queues.includes("platform.maintenance"), true);
});

test("worker retries failed jobs until max attempts", async () => {
  const calls = [];
  const service = new JobWorkerService(
    {
      $transaction: async (callback) =>
        callback({
          $queryRaw: async () => [{ uuid: "job-2" }],
          backgroundJob: {
            update: async ({ where, data, select }) => {
              calls.push({ table: "BackgroundJob", where, data });
              if (select) {
                return {
                  uuid: "job-2",
                  type: "RESULT_BATCH_VALIDATION",
                  queue: "results.validation",
                  institutionId: "institution-1",
                  createdById: "founder-1",
                  payload: { request: { institutionId: "AINi-00001", rows: [] } },
                  attempts: 1,
                  maxAttempts: 3
                };
              }
              return { uuid: where.uuid };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              calls.push({ table: "DomainEvent", data });
              return { uuid: "event-2", ...data };
            }
          }
        })
    },
    {
      ingestResults: async () => {
        throw new Error("validation failed");
      }
    },
    {
      parseStudentUpload: async () => {
        throw new Error("result validation jobs should not parse uploads");
      }
    }
  );

  const result = await service.runOnce("worker-test", 1);

  assert.deepEqual(result, { processed: 1, succeeded: 0, failed: 1 });
  assert.equal(calls[1].data.status, "RETRYING");
  assert.equal(calls[1].data.error, "validation failed");
  assert.equal(calls[2].data.type, "result_batch_validation.retrying");
});

test("worker processes rate-limit bucket cleanup jobs through maintenance queue", async () => {
  const calls = [];
  const service = new JobWorkerService(
    {
      $transaction: async (callback) =>
        callback({
          $queryRaw: async () => [{ uuid: "job-rate-limit-cleanup" }],
          backgroundJob: {
            update: async ({ where, data, select }) => {
              calls.push({ table: "BackgroundJob", where, data });
              if (select) {
                return {
                  uuid: "job-rate-limit-cleanup",
                  type: "RATE_LIMIT_BUCKET_CLEANUP",
                  queue: "platform.maintenance",
                  institutionId: null,
                  createdById: "founder-1",
                  payload: { olderThanHours: 48 },
                  attempts: 1,
                  maxAttempts: 2
                };
              }
              return { uuid: where.uuid };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              calls.push({ table: "DomainEvent", data });
              return { uuid: "event-cleanup", ...data };
            }
          }
        })
    },
    {},
    {},
    undefined,
    undefined,
    {
      cleanupExpiredBuckets: async ({ olderThanHours }) => ({
        cleanedAt: new Date("2026-05-09T10:00:00.000Z"),
        cutoff: new Date("2026-05-07T10:00:00.000Z"),
        olderThanHours,
        deletedBuckets: 12
      })
    }
  );

  const result = await service.runOnce("worker-test", 1);

  assert.deepEqual(result, { processed: 1, succeeded: 1, failed: 0 });
  assert.equal(calls[1].data.status, "SUCCEEDED");
  assert.equal(calls[1].data.result.mode, "rate_limit_bucket_cleanup");
  assert.equal(calls[1].data.result.deletedBuckets, 12);
  assert.equal(calls[2].data.type, "rate_limit_bucket_cleanup.succeeded");
});

test("worker processes idempotency record cleanup jobs through maintenance queue", async () => {
  const calls = [];
  const service = new JobWorkerService(
    {
      $transaction: async (callback) =>
        callback({
          $queryRaw: async () => [{ uuid: "job-idempotency-cleanup" }],
          backgroundJob: {
            update: async ({ where, data, select }) => {
              calls.push({ table: "BackgroundJob", where, data });
              if (select) {
                return {
                  uuid: "job-idempotency-cleanup",
                  type: "IDEMPOTENCY_RECORD_CLEANUP",
                  queue: "platform.maintenance",
                  institutionId: null,
                  createdById: "founder-1",
                  payload: { olderThanHours: 72 },
                  attempts: 1,
                  maxAttempts: 2
                };
              }
              return { uuid: where.uuid };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              calls.push({ table: "DomainEvent", data });
              return { uuid: "event-idempotency-cleanup", ...data };
            }
          }
        })
    },
    {},
    {},
    undefined,
    undefined,
    undefined,
    undefined,
    {
      cleanupExpiredRecords: async ({ olderThanHours }) => ({
        cutoff: new Date("2026-05-06T10:00:00.000Z"),
        olderThanHours,
        deletedRecords: 7
      })
    }
  );

  const result = await service.runOnce("worker-test", 1);

  assert.deepEqual(result, { processed: 1, succeeded: 1, failed: 0 });
  assert.equal(calls[1].data.status, "SUCCEEDED");
  assert.equal(calls[1].data.result.mode, "idempotency_record_cleanup");
  assert.equal(calls[1].data.result.deletedRecords, 7);
  assert.equal(calls[2].data.type, "idempotency_record_cleanup.succeeded");
});

test("worker delivers webhooks with signed idempotent headers", async () => {
  const previousSecret = process.env.ACADID_WEBHOOK_SECRET;
  process.env.ACADID_WEBHOOK_SECRET = "test-webhook-secret";
  const previousFetch = globalThis.fetch;
  const calls = [];
  let fetchCall;
  globalThis.fetch = async (url, init) => {
    fetchCall = { url, init };
    return {
      ok: true,
      status: 202,
      text: async () => ""
    };
  };

  try {
    const delivery = {
      uuid: "delivery-1",
      targetUrl: "https://partner.example/webhooks/acadid",
      eventType: "credential.issued",
      payload: { credentialId: "credential-1" },
      attempts: 0
    };
    const service = new JobWorkerService(
      {
        $transaction: async (callback) =>
          callback({
            $queryRaw: async () => [{ uuid: "job-webhook-1" }],
            backgroundJob: {
              update: async ({ where, data, select }) => {
                calls.push({ table: "BackgroundJob", where, data });
                if (select) {
                  return {
                    uuid: "job-webhook-1",
                    type: "WEBHOOK_DELIVERY",
                    queue: "webhooks.delivery",
                    institutionId: "institution-1",
                    createdById: "founder-1",
                    payload: { deliveryId: delivery.uuid },
                    attempts: 1,
                    maxAttempts: 3
                  };
                }
                return { uuid: where.uuid };
              }
            },
            domainEvent: {
              create: async ({ data }) => {
                calls.push({ table: "DomainEvent", data });
                return { uuid: "event-webhook-1", ...data };
              }
            }
          }),
        webhookDelivery: {
          findFirst: async () => delivery,
          update: async ({ where, data }) => {
            calls.push({ table: "WebhookDelivery", where, data });
            return { ...delivery, ...data };
          }
        }
      },
      {},
      {}
    );

    const result = await service.runOnce("worker-test", 1);
    const body = fetchCall.init.body;
    const timestamp = fetchCall.init.headers["x-acadid-timestamp"];
    const expectedSignature = createHmac("sha256", "test-webhook-secret").update(`${timestamp}.${delivery.uuid}.${body}`).digest("hex");

    assert.deepEqual(result, { processed: 1, succeeded: 1, failed: 0 });
    assert.equal(fetchCall.url, delivery.targetUrl);
    assert.equal(fetchCall.init.headers["x-acadid-event"], "credential.issued");
    assert.equal(fetchCall.init.headers["x-acadid-delivery"], "delivery-1");
    assert.equal(fetchCall.init.headers["x-acadid-idempotency-key"], "whd_delivery-1");
    assert.equal(fetchCall.init.headers["x-acadid-signature"], `v1=${expectedSignature}`);
    assert.equal(calls.some((call) => call.table === "WebhookDelivery" && call.data.status === "DELIVERED"), true);
    assert.equal(calls.some((call) => call.table === "DomainEvent" && call.data.type === "webhook_delivery.succeeded"), true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.ACADID_WEBHOOK_SECRET;
    else process.env.ACADID_WEBHOOK_SECRET = previousSecret;
  }
});

test("worker signs webhooks with the institution endpoint secret when configured", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  let fetchCall;
  globalThis.fetch = async (url, init) => {
    fetchCall = { url, init };
    return {
      ok: true,
      status: 202,
      text: async () => ""
    };
  };

  try {
    const secrets = new WebhookSecretService();
    const endpointSecret = "whsec_endpoint_specific_secret";
    const delivery = {
      uuid: "delivery-endpoint-1",
      targetUrl: "https://partner.example/webhooks/acadid",
      eventType: "credential.issued",
      payload: { credentialId: "credential-1" },
      attempts: 0,
      webhookEndpoint: {
        uuid: "endpoint-1",
        status: "ACTIVE",
        secretEncrypted: secrets.encrypt(endpointSecret)
      }
    };
    const service = new JobWorkerService(
      {
        $transaction: async (callback) =>
          callback({
            $queryRaw: async () => [{ uuid: "job-webhook-endpoint-1" }],
            backgroundJob: {
              update: async ({ where, data, select }) => {
                calls.push({ table: "BackgroundJob", where, data });
                if (select) {
                  return {
                    uuid: "job-webhook-endpoint-1",
                    type: "WEBHOOK_DELIVERY",
                    queue: "webhooks.delivery",
                    institutionId: "institution-1",
                    createdById: "founder-1",
                    payload: { deliveryId: delivery.uuid },
                    attempts: 1,
                    maxAttempts: 3
                  };
                }
                return { uuid: where.uuid };
              }
            },
            domainEvent: {
              create: async ({ data }) => {
                calls.push({ table: "DomainEvent", data });
                return { uuid: "event-webhook-endpoint-1", ...data };
              }
            }
          }),
        webhookDelivery: {
          findFirst: async () => delivery,
          update: async ({ where, data }) => {
            calls.push({ table: "WebhookDelivery", where, data });
            return { ...delivery, ...data };
          }
        }
      },
      {},
      {},
      undefined,
      secrets
    );

    const result = await service.runOnce("worker-test", 1);
    const body = fetchCall.init.body;
    const timestamp = fetchCall.init.headers["x-acadid-timestamp"];
    const expectedSignature = createHmac("sha256", endpointSecret).update(`${timestamp}.${delivery.uuid}.${body}`).digest("hex");

    assert.deepEqual(result, { processed: 1, succeeded: 1, failed: 0 });
    assert.equal(fetchCall.init.headers["x-acadid-webhook-endpoint"], "endpoint-1");
    assert.equal(fetchCall.init.headers["x-acadid-signature"], `v1=${expectedSignature}`);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("worker moves exhausted webhook deliveries to failed dead-letter state", async () => {
  const previousSecret = process.env.ACADID_WEBHOOK_SECRET;
  process.env.ACADID_WEBHOOK_SECRET = "test-webhook-secret";
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => "partner unavailable"
  });

  try {
    const delivery = {
      uuid: "delivery-failed-1",
      targetUrl: "https://partner.example/webhooks/acadid",
      eventType: "credential.revoked",
      payload: { credentialId: "credential-1" },
      attempts: 2
    };
    const service = new JobWorkerService(
      {
        $transaction: async (callback) =>
          callback({
            $queryRaw: async () => [{ uuid: "job-webhook-failed-1" }],
            backgroundJob: {
              update: async ({ where, data, select }) => {
                calls.push({ table: "BackgroundJob", where, data });
                if (select) {
                  return {
                    uuid: "job-webhook-failed-1",
                    type: "WEBHOOK_DELIVERY",
                    queue: "webhooks.delivery",
                    institutionId: "institution-1",
                    createdById: "founder-1",
                    payload: { deliveryId: delivery.uuid },
                    attempts: 3,
                    maxAttempts: 3
                  };
                }
                return { uuid: where.uuid };
              }
            },
            webhookDelivery: {
              updateMany: async ({ where, data }) => {
                calls.push({ table: "WebhookDelivery", where, data });
                return { count: 1 };
              }
            },
            domainEvent: {
              create: async ({ data }) => {
                calls.push({ table: "DomainEvent", data });
                return { uuid: "event-webhook-failed-1", ...data };
              }
            }
          }),
        webhookDelivery: {
          findFirst: async () => delivery,
          update: async ({ where, data }) => {
            calls.push({ table: "WebhookDelivery", where, data });
            return { ...delivery, ...data };
          }
        }
      },
      {},
      {}
    );

    const result = await service.runOnce("worker-test", 1);

    assert.deepEqual(result, { processed: 1, succeeded: 0, failed: 1 });
    assert.equal(calls.some((call) => call.table === "BackgroundJob" && call.data.status === "FAILED"), true);
    assert.equal(calls.some((call) => call.table === "WebhookDelivery" && call.data.status === "FAILED"), true);
    assert.equal(calls.some((call) => call.table === "DomainEvent" && call.data.type === "webhook_delivery.failed"), true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.ACADID_WEBHOOK_SECRET;
    else process.env.ACADID_WEBHOOK_SECRET = previousSecret;
  }
});
