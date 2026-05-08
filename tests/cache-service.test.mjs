import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";
import { VerificationService } from "../apps/api/dist/apps/api/src/modules/gateway/verification/verification.service.js";
import { CacheService } from "../apps/api/dist/apps/api/src/modules/platform/services/cache.service.js";

test("cache service returns TTL hits and supports tag invalidation", async () => {
  const cache = new CacheService();
  let loads = 0;

  const first = await cache.getOrSet(
    "platform-settings:current",
    async () => {
      loads += 1;
      return { version: 1 };
    },
    { ttlSeconds: 60, tags: ["platform-settings"] }
  );
  const second = await cache.getOrSet(
    "platform-settings:current",
    async () => {
      loads += 1;
      return { version: 2 };
    },
    { ttlSeconds: 60, tags: ["platform-settings"] }
  );

  assert.deepEqual(first, { version: 1 });
  assert.deepEqual(second, { version: 1 });
  assert.equal(loads, 1);

  cache.invalidateTag("platform-settings");
  const afterInvalidate = await cache.getOrSet(
    "platform-settings:current",
    async () => {
      loads += 1;
      return { version: 3 };
    },
    { ttlSeconds: 60, tags: ["platform-settings"] }
  );

  assert.deepEqual(afterInvalidate, { version: 3 });
  assert.equal(loads, 2);
});

test("credential status uses cache without caching verification events or secrets", async () => {
  const cache = new CacheService();
  let reads = 0;
  const service = new VerificationService(
    {
      credential: {
        findUnique: async () => {
          reads += 1;
          return {
            credentialRef: "CRED-CACHE-1",
            status: "ACTIVE",
            revokedAt: null,
            revocationReason: null
          };
        }
      }
    },
    {},
    cache
  );

  const first = await service.credentialStatus("CRED-CACHE-1");
  const second = await service.credentialStatus("CRED-CACHE-1");

  assert.equal(first.status, "ACTIVE");
  assert.equal(second.status, "ACTIVE");
  assert.equal(reads, 1);

  cache.invalidateTag("credential:CRED-CACHE-1");
  await service.credentialStatus("CRED-CACHE-1");
  assert.equal(reads, 2);
});

test("platform settings cache is invalidated after founder updates settings", async () => {
  const cache = new CacheService();
  let reads = 0;
  const persisted = new Map();
  const prisma = {
    platformSetting: {
      findMany: async () => {
        reads += 1;
        return [...persisted.entries()].map(([key, value]) => ({
          key,
          value,
          updatedAt: new Date("2026-05-08T10:00:00.000Z"),
          updatedBy: { fullName: "Founder Admin", email: "founder@acadid.local" }
        }));
      },
      upsert: (operation) => {
        persisted.set(operation.where.key, operation.update.value ?? operation.create.value);
        return Promise.resolve({ uuid: operation.where.key, ...operation.update });
      }
    },
    $transaction: async (operations) => Promise.all(operations)
  };
  const service = new AdminService(
    prisma,
    { write: async () => undefined },
    {},
    undefined,
    cache
  );

  await service.readPlatformSettings();
  await service.readPlatformSettings();
  assert.equal(reads, 1);

  await service.updatePlatformSettings(
    { sub: "00000000-0000-0000-0000-000000000001", role: "ACADID_SUPER_ADMIN" },
    {
      approval: {
        requireMou: true,
        requireDocumentUpload: true,
        allowAutoApprove: false,
        maxApplicationReviewDays: 12
      },
      api: {
        defaultEnvironment: "SANDBOX",
        defaultRateLimitPerMinute: 1500,
        productKeyRotationDays: 120,
        institutionKeyRotationDays: 90
      },
      notifications: {
        founderEmail: "founder@acadid.local",
        notifyOnNewApplication: true,
        notifyOnDeveloperRequest: true,
        notifyOnDispute: true,
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

  assert.equal(reads, 2);
  await service.readPlatformSettings();
  assert.equal(reads, 2);
});
