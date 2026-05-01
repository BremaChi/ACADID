import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

test("founder platform settings return safe defaults before persistence", async () => {
  const service = new AdminService(
    {
      platformSetting: {
        findMany: async () => []
      }
    },
    {},
    {}
  );

  const response = await service.readPlatformSettings();

  assert.equal(response.settings.approval.requireMou, true);
  assert.equal(response.settings.approval.allowAutoApprove, false);
  assert.equal(response.settings.api.defaultEnvironment, "SANDBOX");
  assert.equal(response.settings.notifications.notifyOnDispute, true);
  assert.equal(response.metadata.persistedKeys.length, 0);
});

test("founder can update platform settings with validation and audit", async () => {
  const writes = [];
  const auditEvents = [];
  const persisted = new Map();
  const prisma = {
    platformSetting: {
      findMany: async () =>
        [...persisted.entries()].map(([key, value]) => ({
          key,
          value,
          updatedAt: new Date("2026-04-30T10:00:00.000Z"),
          updatedBy: { fullName: "Founder Admin", email: "founder@acadid.local" }
        })),
      upsert: (operation) => {
        writes.push(operation);
        persisted.set(operation.where.key, operation.update.value ?? operation.create.value);
        return Promise.resolve({ uuid: operation.where.key, ...operation.update });
      }
    },
    $transaction: async (operations) => Promise.all(operations)
  };
  const service = new AdminService(
    prisma,
    {
      write: async (event) => {
        auditEvents.push(event);
      }
    },
    {}
  );

  const response = await service.updatePlatformSettings(
    { sub: "00000000-0000-0000-0000-000000000001", role: "ACADID_SUPER_ADMIN" },
    {
      approval: {
        requireMou: true,
        requireDocumentUpload: true,
        allowAutoApprove: false,
        maxApplicationReviewDays: 10
      },
      api: {
        defaultEnvironment: "SANDBOX",
        defaultRateLimitPerMinute: 2000,
        productKeyRotationDays: 120,
        institutionKeyRotationDays: 90
      },
      notifications: {
        founderEmail: "founder@acadid.local",
        notifyOnNewApplication: true,
        notifyOnDeveloperRequest: true,
        notifyOnDispute: false,
        weeklySummaryEnabled: true
      },
      emailTemplates: {
        applicationApprovedSubject: "Application approved",
        applicationRejectedSubject: "Application update",
        developerAccessApprovedSubject: "Developer Access approved",
        disputeNoticeSubject: "Credential dispute notice"
      }
    }
  );

  assert.equal(writes.length, 4);
  assert.equal(auditEvents[0].action, "platform_settings.update");
  assert.deepEqual(auditEvents[0].metadata.keys, ["approval", "api", "notifications", "emailTemplates"]);
  assert.equal(response.settings.api.defaultRateLimitPerMinute, 2000);
  assert.equal(response.settings.notifications.notifyOnDispute, false);
  assert.equal(response.metadata.persistedKeys.includes("approval"), true);
});

test("founder platform settings reject unsafe limits", async () => {
  const service = new AdminService(
    {
      platformSetting: {
        findMany: async () => []
      }
    },
    {},
    {}
  );

  await assert.rejects(
    () =>
      service.updatePlatformSettings(
        { sub: "00000000-0000-0000-0000-000000000001", role: "ACADID_SUPER_ADMIN" },
        {
          approval: {
            requireMou: true,
            requireDocumentUpload: true,
            allowAutoApprove: false,
            maxApplicationReviewDays: 0
          },
          api: {
            defaultEnvironment: "PRODUCTION",
            defaultRateLimitPerMinute: 5,
            productKeyRotationDays: 0,
            institutionKeyRotationDays: 0
          },
          notifications: {
            founderEmail: "not-an-email",
            notifyOnNewApplication: true,
            notifyOnDeveloperRequest: true,
            notifyOnDispute: true,
            weeklySummaryEnabled: true
          },
          emailTemplates: {
            applicationApprovedSubject: "ok",
            applicationRejectedSubject: "ok",
            developerAccessApprovedSubject: "ok",
            disputeNoticeSubject: "ok"
          }
        }
      ),
    /Bad Request/
  );
});
