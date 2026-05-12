import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

function failedJob(overrides = {}) {
  return {
    uuid: "job-failed-1",
    type: "WEBHOOK_DELIVERY",
    queue: "webhooks.delivery",
    status: "FAILED",
    institutionId: "institution-1",
    createdById: "founder-1",
    relatedEntityType: "WebhookDelivery",
    relatedEntityId: "delivery-1",
    priority: 1,
    progress: 100,
    attempts: 8,
    maxAttempts: 8,
    runAfter: new Date("2026-05-10T10:00:00.000Z"),
    error: "partner unavailable",
    failedAt: new Date("2026-05-10T10:01:00.000Z"),
    startedAt: new Date("2026-05-10T10:00:00.000Z"),
    completedAt: null,
    createdAt: new Date("2026-05-10T09:59:00.000Z"),
    updatedAt: new Date("2026-05-10T10:01:00.000Z"),
    institution: { uuid: "institution-1", institutionId: "AINi-00001", officialName: "AcadID Test School" },
    createdBy: { uuid: "founder-1", fullName: "Founder Admin", email: "founder@acadid.local" },
    webhookDeliveries: [],
    notifications: [],
    ...overrides
  };
}

test("founder lists dead-letter jobs, webhooks, and failed notifications", async () => {
  const service = new AdminService(
    {
      backgroundJob: {
        findMany: async () => [failedJob()],
        count: async () => 1
      },
      webhookDelivery: {
        findMany: async () => [
          {
            uuid: "delivery-1",
            jobId: "job-failed-1",
            eventId: "event-1",
            institutionId: "institution-1",
            institution: { uuid: "institution-1", institutionId: "AINi-00001", officialName: "AcadID Test School" },
            webhookEndpointId: null,
            webhookEndpoint: null,
            targetUrl: "https://partner.example/webhook",
            eventType: "credential.issued",
            payload: {},
            status: "FAILED",
            attempts: 8,
            nextAttemptAt: new Date("2026-05-10T10:30:00.000Z"),
            lastStatusCode: 500,
            lastError: "partner unavailable",
            deliveredAt: null,
            createdAt: new Date("2026-05-10T09:59:00.000Z"),
            updatedAt: new Date("2026-05-10T10:01:00.000Z"),
            job: { uuid: "job-failed-1", status: "FAILED", attempts: 8, maxAttempts: 8, runAfter: new Date("2026-05-10T10:00:00.000Z"), error: "partner unavailable" }
          }
        ],
        count: async () => 1
      },
      notification: {
        findMany: async () => [
          {
            uuid: "notification-1",
            jobId: "job-notification-1",
            institution: null,
            learner: null,
            user: null,
            job: { uuid: "job-notification-1", status: "FAILED", type: "SMS_EMAIL_DELIVERY", queue: "notifications.delivery" },
            channel: "EMAIL",
            type: "record_request.updated",
            title: "Record request updated",
            status: "FAILED",
            sentAt: null,
            failedAt: new Date("2026-05-10T10:02:00.000Z"),
            error: "provider unavailable",
            createdAt: new Date("2026-05-10T10:00:00.000Z"),
            updatedAt: new Date("2026-05-10T10:02:00.000Z")
          }
        ],
        count: async () => 1
      }
    },
    {}
  );

  const result = await service.listDeadLetters();

  assert.equal(result.summary.failedJobs, 1);
  assert.equal(result.summary.failedWebhookDeliveries, 1);
  assert.equal(result.summary.failedNotifications, 1);
  assert.equal(result.jobs[0].id, "job-failed-1");
  assert.equal(result.jobs[0].error, "partner unavailable");
  assert.equal(result.webhookDeliveries[0].id, "delivery-1");
  assert.equal(result.notifications[0].id, "notification-1");
});

test("founder can requeue a dead-letter background job with audit trail", async () => {
  const calls = [];
  const service = new AdminService(
    {
      backgroundJob: {
        findUnique: async () => failedJob(),
        update: async ({ where, data, include }) => {
          calls.push({ table: "BackgroundJob", where, data });
          return failedJob({
            uuid: where.uuid,
            status: data.status,
            error: data.error,
            failedAt: data.failedAt,
            maxAttempts: data.maxAttempts
          });
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
          return { uuid: "event-1", ...data };
        }
      },
      $transaction: async (callback) =>
        callback({
          backgroundJob: {
            update: async (args) => service.prisma.backgroundJob.update(args)
          },
          webhookDelivery: {
            updateMany: async (args) => service.prisma.webhookDelivery.updateMany(args)
          },
          domainEvent: {
            create: async (args) => service.prisma.domainEvent.create(args)
          }
        })
    },
    {
      write: async (event) => {
        calls.push({ table: "AuditEvent", data: event });
      }
    }
  );

  const result = await service.retryDeadLetterJob(
    {
      sub: "founder-1",
      email: "founder@acadid.local",
      fullName: "Founder Admin",
      role: "ACADID_SUPER_ADMIN",
      iat: 1,
      exp: 2
    },
    "job-failed-1"
  );

  assert.equal(result.accepted, true);
  assert.equal(result.job.status, "RETRYING");
  assert.equal(calls.some((call) => call.table === "WebhookDelivery" && call.data.status === "RETRYING"), true);
  assert.equal(calls.some((call) => call.table === "DomainEvent" && call.data.type === "background_job.dead_letter_retry_queued"), true);
  assert.equal(calls.some((call) => call.table === "AuditEvent" && call.data.action === "background_job.dead_letter_retry_queued"), true);
});
