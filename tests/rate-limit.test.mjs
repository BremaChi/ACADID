import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { RateLimitService } from "../apps/api/dist/apps/api/src/modules/platform/services/rate-limit.service.js";

test("persistent rate limiter increments a durable bucket and returns remaining quota", async () => {
  const upserts = [];
  const service = new RateLimitService({
    rateLimitBucket: {
      upsert: async (operation) => {
        upserts.push(operation);
        return {
          count: 2,
          limit: operation.update.limit,
          windowStart: operation.where.scope_bucketKeyHash_windowStart.windowStart,
          windowSeconds: operation.update.windowSeconds
        };
      }
    }
  });

  const result = await service.assertAllowed({
    scope: "verify.public",
    key: "ip:127.0.0.1",
    limit: 120,
    windowSeconds: 60
  });

  assert.equal(result.remaining, 118);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].where.scope_bucketKeyHash_windowStart.scope, "verify.public");
  assert.equal(upserts[0].where.scope_bucketKeyHash_windowStart.bucketKeyHash.length, 64);
  assert.equal(upserts[0].update.count.increment, 1);
});

test("persistent rate limiter rejects requests over the configured limit", async () => {
  const service = new RateLimitService({
    rateLimitBucket: {
      upsert: async (operation) => ({
        count: 11,
        limit: 10,
        windowStart: operation.where.scope_bucketKeyHash_windowStart.windowStart,
        windowSeconds: 60
      })
    }
  });

  await assert.rejects(
    () =>
      service.assertAllowed({
        scope: "auth.login",
        key: "ip-body:127.0.0.1:founder@acadid.local",
        limit: 10,
        windowSeconds: 60
      }),
    (error) => error instanceof HttpException && error.getStatus() === 429
  );
});

test("request rate-limit keys avoid storing raw IP and body identifiers", () => {
  const service = new RateLimitService({});
  const key = service.keyForRequest(
    {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1"
      },
      socket: {},
      body: {
        email: "Founder@AcadID.Local"
      }
    },
    {
      scope: "auth.login",
      key: "ip_and_body",
      bodyField: "email",
      limit: 10
    }
  );

  assert.equal(key, "ip-body:203.0.113.10:founder@acadid.local");
});

test("rate-limit summary reports recent, stale, and top scope counters", async () => {
  const service = new RateLimitService({
    rateLimitBucket: {
      count: async ({ where } = {}) => {
        if (where?.windowStart?.gte) return 4;
        if (where?.windowStart?.lt) return 2;
        return 6;
      },
      aggregate: async ({ where } = {}) => ({
        _sum: {
          count: where?.windowStart?.gte ? 120 : 400
        }
      }),
      groupBy: async () => [
        { scope: "verify.public", _count: { _all: 3 }, _sum: { count: 90 } },
        { scope: "auth.login", _count: { _all: 1 }, _sum: { count: 30 } }
      ]
    }
  });

  const summary = await service.readBucketSummary({ recentHours: 24, staleAfterHours: 24 });

  assert.equal(summary.totalBuckets, 6);
  assert.equal(summary.recentBuckets, 4);
  assert.equal(summary.staleBuckets, 2);
  assert.equal(summary.totalRequests, 400);
  assert.equal(summary.recentRequests, 120);
  assert.deepEqual(summary.topScopes[0], { scope: "verify.public", buckets: 3, requests: 90 });
});

test("rate-limit cleanup deletes only old bucket windows", async () => {
  let deleteWhere;
  const service = new RateLimitService({
    rateLimitBucket: {
      deleteMany: async ({ where }) => {
        deleteWhere = where;
        return { count: 8 };
      }
    }
  });

  const result = await service.cleanupExpiredBuckets({ olderThanHours: 48 });

  assert.equal(result.olderThanHours, 48);
  assert.equal(result.deletedBuckets, 8);
  assert.equal(deleteWhere.windowStart.lt instanceof Date, true);
});
