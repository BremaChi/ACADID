import assert from "node:assert/strict";
import test from "node:test";
import { QueueService } from "../apps/api/dist/apps/api/src/modules/platform/services/queue.service.js";

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
