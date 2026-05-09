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

test("cache service can read through an Upstash Redis REST adapter", async () => {
  const previousAdapter = process.env.ACADID_CACHE_ADAPTER;
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.ACADID_CACHE_ADAPTER = "upstash";
  process.env.UPSTASH_REDIS_REST_URL = "https://cache.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "cache-token";
  let loads = 0;
  const commands = [];
  globalThis.fetch = async (_url, init) => {
    const [[command, key]] = JSON.parse(init.body);
    commands.push({ command, key });
    if (command === "GET") {
      return {
        ok: true,
        json: async () => [
          {
            result: JSON.stringify({
              value: { version: 7 },
              expiresAt: Date.now() + 30_000,
              tags: ["platform-settings"]
            })
          }
        ]
      };
    }
    return { ok: true, json: async () => [{ result: "OK" }] };
  };

  try {
    const cache = new CacheService();
    const value = await cache.getOrSet(
      "platform-settings:current",
      async () => {
        loads += 1;
        return { version: 1 };
      },
      { ttlSeconds: 60, tags: ["platform-settings"] }
    );

    assert.deepEqual(value, { version: 7 });
    assert.equal(loads, 0);
    assert.equal(commands[0].command, "GET");
    assert.equal(commands[0].key, "acadid:cache:entry:platform-settings:current");
    assert.equal(cache.stats().adapter, "upstash-redis");
    assert.equal(cache.stats().distributedConfigured, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousAdapter === undefined) delete process.env.ACADID_CACHE_ADAPTER;
    else process.env.ACADID_CACHE_ADAPTER = previousAdapter;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
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
