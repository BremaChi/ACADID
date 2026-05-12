import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

test("founder system health returns component and gateway metrics", async () => {
  const previousWebhookSecret = process.env.ACADID_WEBHOOK_SECRET;
  process.env.ACADID_WEBHOOK_SECRET = "test-webhook-secret";
  const service = new AdminService(
    {
      $queryRaw: async () => [{ ok: 1 }],
      user: {
        count: async () => 1
      },
      auditEvent: {
        count: async ({ where }) => {
          if (where?.targetType === "WebhookDelivery") return 0;
          if (where?.outcome?.not === "SUCCESS") return 2;
          return 12;
        }
      },
      verificationEvent: {
        count: async ({ where }) => {
          if (where?.outcome === "DENIED") return 1;
          if (where?.outcome === "REVOKED") return 0;
          if (where?.outcome === "DISCREPANCY") return 1;
          return 20;
        }
      },
      credential: {
        count: async () => 7
      },
      backgroundJob: {
        count: async ({ where }) => {
          if (where?.lockedAt?.lt) return 0;
          if (where?.status === "RUNNING") return 1;
          if (where?.status === "FAILED") return 0;
          if (where?.runAfter?.gt) return 2;
          return 4;
        },
        groupBy: async () => [
          { queue: "ingestion.bulk", status: "QUEUED", _count: { _all: 3 } },
          { queue: "webhooks.delivery", status: "RUNNING", _count: { _all: 1 } }
        ],
        findMany: async () => [
          {
            uuid: "job-1",
            queue: "webhooks.delivery",
            type: "WEBHOOK_DELIVERY",
            status: "RUNNING",
            lockedBy: "worker-1",
            lockedAt: new Date("2026-05-08T10:00:00.000Z"),
            startedAt: new Date("2026-05-08T10:00:00.000Z"),
            completedAt: null,
            failedAt: null,
            updatedAt: new Date("2026-05-08T10:01:00.000Z")
          }
        ]
      },
      webhookDelivery: {
        count: async ({ where }) => {
          if (where?.status === "DELIVERED") return 9;
          if (where?.status === "FAILED") return 0;
          return 1;
        },
        groupBy: async () => [
          { status: "DELIVERED", _count: { _all: 9 } },
          { status: "PENDING", _count: { _all: 1 } }
        ]
      },
      webhookEndpoint: {
        count: async () => 2
      },
      notification: {
        count: async () => 0,
        groupBy: async () => [],
        findMany: async () => []
      }
    },
    {},
    {},
    {
      readiness: () => ({
        proofProfile: "JOSE_JWS",
        algorithm: "EdDSA",
        curve: "Ed25519",
        verificationMethod: "did:web:test.acadid#issuer-ed25519",
        keySource: "CONFIGURED",
        configured: true,
        productionReady: true,
        publicJwk: { kty: "OKP", crv: "Ed25519", x: "test" }
      })
    }
  );

  const health = await service.readSystemHealth();
  if (previousWebhookSecret === undefined) delete process.env.ACADID_WEBHOOK_SECRET;
  else process.env.ACADID_WEBHOOK_SECRET = previousWebhookSecret;

  assert.equal(health.overallStatus, "OPERATIONAL");
  assert.equal(health.services.some((service) => service.name === "Database" && service.status === "OPERATIONAL"), true);
  assert.equal(health.services.some((service) => service.name === "Background Workers" && service.status === "OPERATIONAL"), true);
  assert.equal(health.services.some((service) => service.name === "Webhook Delivery" && service.status === "OPERATIONAL"), true);
  assert.equal(health.services.some((service) => service.name === "Credential Signing" && service.status === "OPERATIONAL"), true);
  assert.equal(health.metrics.gatewayRequestsToday, 32);
  assert.equal(health.metrics.failedAuditEvents, 2);
  assert.equal(health.metrics.publishedCredentialsToday, 7);
  assert.equal(health.metrics.readyBackgroundJobs, 4);
  assert.equal(health.metrics.pendingWebhooks, 1);
  assert.equal(health.incidents.some((incident) => incident.title === "Gateway risk events detected"), true);
});

test("founder system health degrades instead of throwing when database ping fails", async () => {
  const service = new AdminService(
    {
      $queryRaw: async () => {
        throw new Error("database unavailable");
      },
      user: {
        count: async () => {
          throw new Error("database unavailable");
        }
      },
      auditEvent: {
        count: async () => {
          throw new Error("database unavailable");
        }
      },
      verificationEvent: {
        count: async () => {
          throw new Error("database unavailable");
        }
      },
      credential: {
        count: async () => {
          throw new Error("database unavailable");
        }
      },
      backgroundJob: {
        count: async () => {
          throw new Error("database unavailable");
        },
        groupBy: async () => {
          throw new Error("database unavailable");
        },
        findMany: async () => {
          throw new Error("database unavailable");
        }
      },
      webhookDelivery: {
        count: async () => {
          throw new Error("database unavailable");
        },
        groupBy: async () => {
          throw new Error("database unavailable");
        }
      },
      webhookEndpoint: {
        count: async () => {
          throw new Error("database unavailable");
        }
      }
    },
    {},
    {},
    {
      readiness: () => ({
        proofProfile: "JOSE_JWS",
        algorithm: "EdDSA",
        curve: "Ed25519",
        verificationMethod: "did:web:localhost:acadid#dev-ed25519",
        keySource: "EPHEMERAL_DEV",
        configured: false,
        productionReady: false,
        publicJwk: { kty: "OKP", crv: "Ed25519", x: "test" },
        warning: "Using an ephemeral development signing key."
      })
    }
  );

  const health = await service.readSystemHealth();

  assert.equal(health.overallStatus, "DOWN");
  assert.equal(health.services.find((service) => service.name === "Database").status, "DOWN");
  assert.equal(health.metrics.status, "DEGRADED");
  assert.equal(health.incidents.length > 0, true);
});
