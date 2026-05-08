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
