import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

const failedNotification = {
  uuid: "notification-1",
  jobId: "old-job-1",
  institutionId: "institution-1",
  learnerId: null,
  userId: null,
  channel: "EMAIL",
  type: "institution.application_update",
  title: "Application update",
  body: "Your application needs review.",
  payload: { to: "registrar@example.edu.ng" },
  status: "FAILED",
  sentAt: null,
  failedAt: new Date("2026-05-09T10:00:00.000Z"),
  error: "Provider unavailable",
  createdAt: new Date("2026-05-09T09:00:00.000Z"),
  updatedAt: new Date("2026-05-09T10:00:00.000Z"),
  institution: {
    uuid: "institution-1",
    institutionId: "AINi-00001",
    officialName: "Lagos State University"
  },
  learner: null,
  user: null,
  job: {
    uuid: "old-job-1",
    status: "FAILED",
    type: "SMS_EMAIL_DELIVERY",
    queue: "notifications.delivery"
  }
};

test("founder lists notifications without payload secrets", async () => {
  const service = new AdminService(
    {
      notification: {
        findMany: async ({ where }) => {
          assert.equal(where.status, "FAILED");
          assert.equal(where.channel, "EMAIL");
          return [failedNotification];
        }
      }
    },
    {},
    {}
  );

  const [notification] = await service.listNotifications({ status: "FAILED", channel: "EMAIL" });

  assert.equal(notification.id, "notification-1");
  assert.equal(notification.title, "Application update");
  assert.equal(notification.institutionName, "Lagos State University");
  assert.equal("payload" in notification, false);
  assert.equal("body" in notification, false);
});

test("founder retries failed notification through a background job", async () => {
  const auditEvents = [];
  const writes = [];
  const service = new AdminService(
    {
      notification: {
        findUnique: async () => failedNotification
      },
      $transaction: async (callback) =>
        callback({
          backgroundJob: {
            create: async ({ data }) => {
              writes.push({ table: "BackgroundJob", data });
              return { uuid: "retry-job-1", status: "QUEUED", ...data };
            }
          },
          notification: {
            update: async ({ where, data }) => {
              writes.push({ table: "Notification", where, data });
              return { ...failedNotification, ...data };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              writes.push({ table: "DomainEvent", data });
              return { uuid: "event-1", ...data };
            }
          }
        })
    },
    { write: async (event) => auditEvents.push(event) },
    {}
  );

  const result = await service.retryNotification({ sub: "founder-1", role: "ACADID_SUPER_ADMIN" }, "notification-1");

  assert.equal(result.jobId, "retry-job-1");
  assert.equal(result.queue, "notifications.delivery");
  assert.equal(writes[0].data.type, "SMS_EMAIL_DELIVERY");
  assert.equal(writes[1].data.status, "PENDING");
  assert.equal(writes[2].data.type, "notification.retry_queued");
  assert.equal(auditEvents[0].action, "notification.retry_queued");
});
