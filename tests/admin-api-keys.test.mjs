import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

test("global API key listing includes institution context without secret material", async () => {
  const service = new AdminService(
    {
      apiKey: {
        findMany: async () => [
          {
            uuid: "key-1",
            institutionId: "institution-uuid-1",
            clientId: "ak_sandbox_test",
            label: "Institution Portal",
            scopes: ["ingest:write"],
            environment: "SANDBOX",
            status: "ACTIVE",
            rateLimitPerMinute: 500,
            expiresAt: null,
            lastUsedAt: null,
            revokedAt: null,
            revokedReason: null,
            createdAt: new Date("2026-04-28T10:00:00.000Z"),
            updatedAt: new Date("2026-04-28T10:00:00.000Z"),
            institution: {
              uuid: "institution-uuid-1",
              institutionId: "AINi-00001",
              officialName: "AcadID Pilot School",
              status: "ACTIVE"
            }
          }
        ]
      }
    },
    {},
    {}
  );

  const [key] = await service.listGlobalApiKeys();

  assert.equal(key.institutionUuid, "institution-uuid-1");
  assert.equal(key.institutionDisplayId, "AINi-00001");
  assert.equal(key.institutionName, "AcadID Pilot School");
  assert.equal("clientSecret" in key, false);
  assert.equal("clientSecretHash" in key, false);
});
