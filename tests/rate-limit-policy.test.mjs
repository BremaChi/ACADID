import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";
import { RateLimitService } from "../apps/api/dist/apps/api/src/modules/platform/services/rate-limit.service.js";

test("product API keys use founder-controlled product rate defaults", async () => {
  const limits = [];
  const service = new RateLimitService({
    platformSetting: {
      findUnique: async () => ({
        value: {
          productDefaultsPerMinute: {
            EMPLOYER_VERIFICATION_PORTAL: 1500
          }
        }
      })
    },
    rateLimitBucket: {
      upsert: async (operation) => {
        limits.push(operation.update.limit);
        return {
          count: 20,
          limit: operation.update.limit,
          windowStart: operation.where.scope_bucketKeyHash_windowStart.windowStart,
          windowSeconds: operation.update.windowSeconds
        };
      }
    }
  });

  const result = await service.assertApiKeyAllowed({
    kind: "API_KEY",
    apiKeyId: "api-key-1",
    apiKeyOwnerType: "PRODUCT",
    productCode: "EMPLOYER_VERIFICATION_PORTAL",
    rateLimitPerMinute: 500
  });

  assert.equal(result.limit, 1500);
  assert.deepEqual(limits, [1500]);
});

test("emergency rate-limit mode caps API key traffic immediately", async () => {
  const service = new RateLimitService({
    platformSetting: {
      findUnique: async () => ({
        value: {
          emergency: {
            enabled: true,
            limitPerMinute: 2,
            reason: "incident response"
          },
          productDefaultsPerMinute: {
            STUDENT_APP: 2000
          }
        }
      })
    },
    rateLimitBucket: {
      upsert: async (operation) => ({
        count: 3,
        limit: operation.update.limit,
        windowStart: operation.where.scope_bucketKeyHash_windowStart.windowStart,
        windowSeconds: operation.update.windowSeconds
      })
    }
  });

  await assert.rejects(
    () =>
      service.assertApiKeyAllowed({
        kind: "API_KEY",
        apiKeyId: "api-key-2",
        apiKeyOwnerType: "PRODUCT",
        productCode: "STUDENT_APP",
        rateLimitPerMinute: 2000
      }),
    (error) => error instanceof HttpException && error.getStatus() === 429
  );
});

test("founder can update rate-limit policy with audit trail", async () => {
  const writes = [];
  const auditEvents = [];
  const service = new AdminService(
    {
      platformSetting: {
        findUnique: async () => ({
          value: writes.at(-1)?.update.value,
          updatedAt: new Date("2026-05-13T00:00:00.000Z"),
          updatedBy: { fullName: "Founder Admin", email: "founder@acadid.local" }
        }),
        upsert: async (operation) => {
          writes.push(operation);
          return { uuid: "setting-1" };
        }
      }
    },
    {
      write: async (event) => {
        auditEvents.push(event);
      }
    },
    {}
  );

  const response = await service.updateRateLimitPolicy(
    { sub: "founder-1", role: "ACADID_SUPER_ADMIN" },
    {
      emergency: {
        enabled: true,
        limitPerMinute: 25,
        reason: "protect verification gateway during incident"
      },
      productDefaultsPerMinute: {
        INSTITUTION_PORTAL: 900,
        STUDENT_APP: 1800
      },
      institutionDefaultsPerMinute: {
        sandbox: 400,
        production: 1500
      },
      institutionOverridesPerMinute: {
        "AINi-00001": 3000
      },
      scopeOverrides: {
        "verify.public": {
          limit: 80,
          windowSeconds: 60
        }
      }
    }
  );

  assert.equal(writes[0].where.key, "rateLimits");
  assert.equal(auditEvents[0].action, "rate_limit_policy.update");
  assert.equal(response.policy.emergency.enabled, true);
  assert.equal(response.policy.productDefaultsPerMinute.STUDENT_APP, 1800);
  assert.equal(response.policy.institutionOverridesPerMinute["AINi-00001"], 3000);
});
