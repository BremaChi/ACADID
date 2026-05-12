import assert from "node:assert/strict";
import test from "node:test";
import { IdempotencyService } from "../apps/api/dist/apps/api/src/modules/platform/services/idempotency.service.js";
import { QueueService } from "../apps/api/dist/apps/api/src/modules/platform/services/queue.service.js";
import { RetryPolicyService } from "../apps/api/dist/apps/api/src/modules/platform/services/retry-policy.service.js";

test("queue service creates a background job with an outbox domain event", async () => {
  const created = {};
  const service = new QueueService(
    {
      $transaction: async (callback) =>
        callback({
          backgroundJob: {
            create: async ({ data }) => {
              created.job = data;
              return {
                uuid: "job-1",
                status: "QUEUED",
                ...data
              };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              created.event = data;
              return { uuid: "event-1", ...data };
            }
          }
        })
    },
    {}
  );

  const result = await service.enqueueJob({
    type: "BULK_STUDENT_UPLOAD",
    institutionId: "institution-1",
    createdById: "founder-1",
    payload: { fileName: "students.csv" },
    eventType: "bulk_student_upload.queued"
  });

  assert.equal(result.jobId, "job-1");
  assert.equal(result.status, "QUEUED");
  assert.equal(result.queue, "ingestion.bulk");
  assert.equal(result.pollingUrl, "/jobs/job-1");
  assert.equal(created.job.type, "BULK_STUDENT_UPLOAD");
  assert.equal(created.event.type, "bulk_student_upload.queued");
  assert.equal(created.event.aggregateId, "job-1");
});

test("queue service applies central retry policy defaults by job type", async () => {
  const created = {};
  const service = new QueueService(
    {
      $transaction: async (callback) =>
        callback({
          backgroundJob: {
            create: async ({ data }) => {
              created.job = data;
              return {
                uuid: "job-credential-1",
                status: "QUEUED",
                ...data
              };
            }
          },
          domainEvent: {
            create: async ({ data }) => ({ uuid: "event-credential-1", ...data })
          }
        })
    },
    {}
  );

  const result = await service.enqueueJob({
    type: "CREDENTIAL_GENERATION",
    institutionId: "institution-1",
    payload: { credentialId: "credential-1" }
  });

  assert.equal(result.jobId, "job-credential-1");
  assert.equal(created.job.maxAttempts, 5);
});

test("retry policy uses capped exponential delay with bounded jitter", () => {
  const service = new RetryPolicyService();

  assert.equal(service.maxAttemptsFor("WEBHOOK_DELIVERY"), 8);
  assert.equal(service.shouldRetry({ type: "WEBHOOK_DELIVERY", attempts: 7, maxAttempts: 8 }), true);
  assert.equal(service.shouldRetry({ type: "WEBHOOK_DELIVERY", attempts: 8, maxAttempts: 8 }), false);
  assert.equal(service.shouldRetry({ type: "BULK_STUDENT_UPLOAD", attempts: 1, nonRetryable: true }), false);
  assert.equal(service.delayMs("WEBHOOK_DELIVERY", 1, () => 0), 30_000);
  assert.equal(service.delayMs("WEBHOOK_DELIVERY", 1, () => 1), 36_000);
  assert.equal(service.delayMs("WEBHOOK_DELIVERY", 20, () => 1), 2_160_000);
});

test("queue service replays idempotent background job responses", async () => {
  let createdJobs = 0;
  let createdRecords = 0;
  const stored = new Map();
  const service = new QueueService(
    {
      idempotencyRecord: {
        findUnique: async ({ where }) => stored.get(`${where.scope_keyHash.scope}:${where.scope_keyHash.keyHash}`) ?? null,
        create: async ({ data }) => {
          createdRecords += 1;
          const row = { uuid: `idem-${createdRecords}`, status: "IN_PROGRESS", response: null, ...data };
          stored.set(`${data.scope}:${data.keyHash}`, row);
          return row;
        },
        update: async ({ where, data }) => {
          const entry = Array.from(stored.entries()).find(([, value]) => value.uuid === where.uuid);
          const row = { ...entry[1], ...data };
          stored.set(entry[0], row);
          return row;
        }
      },
      $transaction: async (callback) =>
        callback({
          backgroundJob: {
            create: async ({ data }) => {
              createdJobs += 1;
              return {
                uuid: `job-${createdJobs}`,
                status: "QUEUED",
                ...data
              };
            }
          },
          domainEvent: {
            create: async ({ data }) => ({ uuid: `event-${createdJobs}`, ...data })
          }
        })
    },
    {},
    new IdempotencyService({
      idempotencyRecord: {
        findUnique: async (args) => stored.get(`${args.where.scope_keyHash.scope}:${args.where.scope_keyHash.keyHash}`) ?? null,
        create: async ({ data }) => {
          createdRecords += 1;
          const row = { uuid: `idem-${createdRecords}`, status: "IN_PROGRESS", response: null, ...data };
          stored.set(`${data.scope}:${data.keyHash}`, row);
          return row;
        },
        update: async ({ where, data }) => {
          const entry = Array.from(stored.entries()).find(([, value]) => value.uuid === where.uuid);
          const row = { ...entry[1], ...data };
          stored.set(entry[0], row);
          return row;
        }
      }
    })
  );

  const input = {
    type: "PDF_GENERATION",
    institutionId: "institution-1",
    relatedEntityType: "Credential",
    relatedEntityId: "credential-1",
    payload: { credentialId: "credential-1" },
    idempotencyKey: "pdf-request-001"
  };

  const first = await service.enqueueJob(input);
  const second = await service.enqueueJob(input);

  assert.equal(first.jobId, "job-1");
  assert.equal(second.jobId, "job-1");
  assert.equal(createdJobs, 1);
});

test("idempotency service summarizes and cleans expired records safely", async () => {
  let cleanupWhere;
  const service = new IdempotencyService({
    idempotencyRecord: {
      count: async ({ where } = {}) => {
        if (where?.expiresAt) return 2;
        if (where?.status === "IN_PROGRESS") return 1;
        if (where?.status === "FAILED") return 3;
        if (where?.status === "SUCCEEDED") return 8;
        if (where?.createdAt) return 4;
        return 12;
      },
      groupBy: async ({ by }) => {
        if (by.includes("status")) {
          return [
            { status: "SUCCEEDED", _count: { _all: 8 } },
            { status: "FAILED", _count: { _all: 3 } }
          ];
        }
        return [
          { operation: "bulk_upload.queued", _count: { _all: 5 } },
          { operation: "pdf_generation.queued", _count: { _all: 2 } }
        ];
      },
      findMany: async () => [
        {
          uuid: "idem-1",
          scope: "job:BULK_STUDENT_UPLOAD",
          keyHash: "1234567890abcdef",
          operation: "bulk_upload.queued",
          status: "SUCCEEDED",
          actorType: "API_KEY",
          actorUserId: null,
          clientId: "ak_test",
          institutionId: "institution-1",
          jobId: "job-1",
          error: null,
          expiresAt: new Date("2026-05-10T00:00:00Z"),
          createdAt: new Date("2026-05-09T00:00:00Z"),
          updatedAt: new Date("2026-05-09T01:00:00Z")
        }
      ],
      deleteMany: async ({ where }) => {
        cleanupWhere = where;
        return { count: 2 };
      }
    }
  });

  const summary = await service.readSummary({ recentHours: 24, staleAfterHours: 2 });
  assert.equal(summary.totalRecords, 12);
  assert.equal(summary.expiredRecords, 2);
  assert.equal(summary.staleInProgressRecords, 1);
  assert.equal(summary.latestRecords[0].keyHashPreview, "1234567890ab...");

  const cleanup = await service.cleanupExpiredRecords({ olderThanHours: 24 });
  assert.equal(cleanup.deletedRecords, 2);
  assert.ok(cleanupWhere.expiresAt.lt instanceof Date);
});

test("queue service creates a durable webhook delivery job", async () => {
  const created = {};
  const service = new QueueService(
    {
      $transaction: async (callback) =>
        callback({
          backgroundJob: {
            create: async ({ data }) => {
              created.job = data;
              return {
                uuid: "job-webhook-1",
                status: "QUEUED",
                ...data
              };
            },
            update: async ({ where, data }) => {
              created.jobUpdate = { where, data };
              return { uuid: where.uuid, ...data };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              created.event = data;
              return { uuid: "event-webhook-1", ...data };
            }
          },
          webhookDelivery: {
            create: async ({ data }) => {
              created.delivery = data;
              return {
                uuid: "delivery-1",
                status: "PENDING",
                nextAttemptAt: new Date("2026-05-08T00:00:00Z"),
                ...data
              };
            }
          }
        })
    },
    {}
  );

  const result = await service.enqueueWebhookDelivery({
    eventId: "event-source-1",
    institutionId: "institution-1",
    targetUrl: "https://partner.example/webhooks/acadid",
    eventType: "credential.issued",
    payload: { credentialId: "credential-1" }
  });

  assert.equal(result.jobId, "job-webhook-1");
  assert.equal(result.id, "delivery-1");
  assert.equal(result.pollingUrl, "/jobs/job-webhook-1");
  assert.equal(result.idempotencyKey, "whd_delivery-1");
  assert.equal(created.job.type, "WEBHOOK_DELIVERY");
  assert.equal(created.job.queue, "webhooks.delivery");
  assert.equal(created.job.maxAttempts, 8);
  assert.equal(created.delivery.jobId, "job-webhook-1");
  assert.equal(created.event.type, "credential.issued.webhook_queued");
  assert.equal(created.jobUpdate.data.relatedEntityId, "delivery-1");
});

test("job polling hides payload and enforces institution access", async () => {
  let assertedInstitutionId = "";
  const service = new QueueService(
    {
      backgroundJob: {
        findUnique: async () => ({
          uuid: "job-1",
          type: "RESULT_BATCH_VALIDATION",
          queue: "results.validation",
          status: "QUEUED",
          institutionId: "institution-1",
          createdById: "registrar-1",
          relatedEntityType: "ResultBatchDraft",
          relatedEntityId: null,
          priority: 0,
          progress: 0,
          attempts: 0,
          maxAttempts: 3,
          result: null,
          error: null,
          runAfter: new Date("2026-05-08T00:00:00Z"),
          startedAt: null,
          completedAt: null,
          failedAt: null,
          createdAt: new Date("2026-05-08T00:00:00Z"),
          updatedAt: new Date("2026-05-08T00:00:00Z"),
          domainEvents: [],
          notifications: []
        })
      }
    },
    {
      assertActorCanOperateInstitution: async (_auth, institutionId) => {
        assertedInstitutionId = institutionId;
      }
    }
  );

  const job = await service.readJob(
    {
      sub: "registrar-1",
      email: "registrar@example.edu.ng",
      fullName: "Registrar",
      role: "REGISTRAR",
      iat: 1,
      exp: 2
    },
    "job-1"
  );

  assert.equal(assertedInstitutionId, "institution-1");
  assert.equal(job.id, "job-1");
  assert.equal(job.status, "QUEUED");
  assert.equal("payload" in job, false);
});
