import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

test("founder system health returns component and gateway metrics", async () => {
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

  assert.equal(health.overallStatus, "OPERATIONAL");
  assert.equal(health.services.some((service) => service.name === "Database" && service.status === "OPERATIONAL"), true);
  assert.equal(health.services.some((service) => service.name === "Credential Signing" && service.status === "OPERATIONAL"), true);
  assert.equal(health.metrics.gatewayRequestsToday, 32);
  assert.equal(health.metrics.failedAuditEvents, 2);
  assert.equal(health.metrics.publishedCredentialsToday, 7);
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
