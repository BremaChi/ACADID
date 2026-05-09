import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";
import { WebhookSecretService } from "../apps/api/dist/apps/api/src/modules/platform/services/webhook-secret.service.js";

const auth = {
  sub: "00000000-0000-0000-0000-000000000001",
  role: "ACADID_SUPER_ADMIN"
};

test("founder creates an institution webhook endpoint with a one-time secret", async () => {
  const auditEvents = [];
  let createdEndpoint;
  const secrets = new WebhookSecretService();
  const service = new AdminService(
    {
      institution: {
        findUnique: async () => ({
          uuid: "institution-1",
          institutionId: "AINi-00001",
          officialName: "Lagos State University"
        })
      },
      webhookEndpoint: {
        create: async ({ data }) => {
          createdEndpoint = data;
          return {
            uuid: "endpoint-1",
            ...data,
            status: "ACTIVE",
            rotatedAt: null,
            disabledAt: null,
            createdAt: new Date("2026-05-09T08:00:00.000Z"),
            updatedAt: new Date("2026-05-09T08:00:00.000Z"),
            institution: {
              uuid: "institution-1",
              institutionId: "AINi-00001",
              officialName: "Lagos State University"
            },
            createdBy: {
              uuid: auth.sub,
              fullName: "Founder Admin",
              email: "founder@acadid.local"
            }
          };
        }
      }
    },
    { write: async (event) => auditEvents.push(event) },
    {},
    undefined,
    undefined,
    secrets
  );

  const response = await service.createWebhookEndpoint(auth, "institution-1", {
    label: "Registrar events",
    targetUrl: "https://partner.example/webhooks/acadid",
    eventTypes: ["credential.issued", "credential.revoked"]
  });

  assert.equal(response.endpoint.id, "endpoint-1");
  assert.equal(response.endpoint.secretPreview.startsWith("..."), true);
  assert.equal(response.secret.startsWith("whsec_"), true);
  assert.equal(createdEndpoint.secretEncrypted.includes(response.secret), false);
  assert.equal(secrets.decrypt(createdEndpoint.secretEncrypted), response.secret);
  assert.equal(auditEvents[0].action, "webhook_endpoint.create");
});

test("founder retry requeues the same webhook delivery with the same idempotency key", async () => {
  const calls = [];
  const auditEvents = [];
  const existingDelivery = {
    uuid: "delivery-1",
    jobId: "old-job-1",
    eventId: "old-event-1",
    institutionId: "institution-1",
    webhookEndpointId: "endpoint-1",
    targetUrl: "https://partner.example/webhooks/acadid",
    eventType: "credential.issued",
    payload: { credentialId: "credential-1" },
    status: "FAILED",
    attempts: 8,
    nextAttemptAt: new Date("2026-05-09T08:00:00.000Z"),
    lastStatusCode: 500,
    lastError: "HTTP 500",
    deliveredAt: null,
    createdAt: new Date("2026-05-09T08:00:00.000Z"),
    updatedAt: new Date("2026-05-09T08:00:00.000Z"),
    institution: { uuid: "institution-1", institutionId: "AINi-00001", officialName: "Lagos State University" },
    webhookEndpoint: { uuid: "endpoint-1", label: "Registrar events", status: "ACTIVE", secretPreview: "...abc123" },
    job: { uuid: "old-job-1", status: "FAILED", attempts: 8, maxAttempts: 8, runAfter: new Date(), error: "HTTP 500" }
  };
  const service = new AdminService(
    {
      webhookDelivery: {
        findUnique: async () => existingDelivery
      },
      $transaction: async (callback) =>
        callback({
          backgroundJob: {
            create: async ({ data }) => {
              calls.push({ table: "BackgroundJob", data });
              return { uuid: "retry-job-1", status: "QUEUED", ...data };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              calls.push({ table: "DomainEvent", data });
              return { uuid: "retry-event-1", ...data };
            }
          },
          webhookDelivery: {
            update: async ({ where, data }) => {
              calls.push({ table: "WebhookDelivery", where, data });
              return { ...existingDelivery, ...data, jobId: data.jobId, job: { uuid: data.jobId, status: "QUEUED", attempts: 0, maxAttempts: 8, runAfter: new Date(), error: null } };
            }
          }
        })
    },
    { write: async (event) => auditEvents.push(event) },
    {}
  );

  const response = await service.retryWebhookDelivery(auth, "delivery-1");

  assert.equal(response.accepted, true);
  assert.equal(response.delivery.id, "delivery-1");
  assert.equal(response.idempotencyKey, "whd_delivery-1");
  assert.equal(calls.some((call) => call.table === "BackgroundJob" && call.data.relatedEntityId === "delivery-1"), true);
  assert.equal(calls.some((call) => call.table === "WebhookDelivery" && call.data.status === "RETRYING"), true);
  assert.equal(auditEvents[0].action, "webhook_delivery.retry");
});

test("founder replay creates a new webhook delivery and new idempotency key", async () => {
  const calls = [];
  const existingDelivery = {
    uuid: "delivery-old",
    jobId: "job-old",
    eventId: "event-old",
    institutionId: "institution-1",
    webhookEndpointId: "endpoint-1",
    targetUrl: "https://partner.example/webhooks/acadid",
    eventType: "credential.revoked",
    payload: { credentialId: "credential-1" },
    status: "DELIVERED",
    attempts: 1,
    nextAttemptAt: new Date("2026-05-09T08:00:00.000Z"),
    lastStatusCode: 200,
    lastError: null,
    deliveredAt: new Date("2026-05-09T08:01:00.000Z"),
    createdAt: new Date("2026-05-09T08:00:00.000Z"),
    updatedAt: new Date("2026-05-09T08:01:00.000Z"),
    institution: { uuid: "institution-1", institutionId: "AINi-00001", officialName: "Lagos State University" },
    webhookEndpoint: { uuid: "endpoint-1", label: "Registrar events", status: "ACTIVE", secretPreview: "...abc123" },
    job: { uuid: "job-old", status: "SUCCEEDED", attempts: 1, maxAttempts: 8, runAfter: new Date(), error: null }
  };
  const service = new AdminService(
    {
      webhookDelivery: {
        findUnique: async () => existingDelivery
      },
      $transaction: async (callback) =>
        callback({
          backgroundJob: {
            create: async ({ data }) => {
              calls.push({ table: "BackgroundJob", data });
              return { uuid: "replay-job-1", status: "QUEUED", ...data };
            },
            update: async ({ where, data }) => {
              calls.push({ table: "BackgroundJob", where, data });
              return { uuid: where.uuid, status: "QUEUED", ...data };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              calls.push({ table: "DomainEvent", data });
              return { uuid: "replay-event-1", ...data };
            }
          },
          webhookDelivery: {
            create: async ({ data }) => {
              calls.push({ table: "WebhookDelivery", data });
              return {
                ...existingDelivery,
                uuid: "delivery-new",
                attempts: 0,
                status: "PENDING",
                deliveredAt: null,
                lastStatusCode: null,
                jobId: data.jobId,
                eventId: data.eventId
              };
            }
          }
        })
    },
    { write: async () => undefined },
    {}
  );

  const response = await service.replayWebhookDelivery(auth, "delivery-old");

  assert.equal(response.accepted, true);
  assert.equal(response.delivery.id, "delivery-new");
  assert.equal(response.idempotencyKey, "whd_delivery-new");
  assert.equal(calls.some((call) => call.table === "WebhookDelivery" && call.data.payload.credentialId === "credential-1"), true);
  assert.equal(calls.some((call) => call.table === "BackgroundJob" && call.data.payload?.deliveryId === "delivery-new"), true);
});
