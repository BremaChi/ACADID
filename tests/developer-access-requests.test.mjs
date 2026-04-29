import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

const founderAuth = {
  sub: "founder-user",
  email: "founder@acadid.local",
  fullName: "Founder",
  role: "ACADID_SUPER_ADMIN",
  iat: 1,
  exp: 2
};

test("founder can create and approve developer access requests", async () => {
  const auditEvents = [];
  const institution = {
    uuid: "11111111-1111-4111-8111-111111111111",
    institutionId: "AINi-00001",
    officialName: "AcadID Pilot School",
    type: "SECONDARY",
    state: "Lagos",
    status: "ACTIVE"
  };
  const createdRequest = {
    uuid: "22222222-2222-4222-8222-222222222222",
    institutionId: institution.uuid,
    requestedById: founderAuth.sub,
    developerName: "Technical Registrar",
    developerEmail: "tech@example.edu.ng",
    developerPhone: null,
    reason: "Live Results API pilot for automated score publication.",
    requestedScopes: ["ingest:write", "govern:write"],
    status: "PENDING",
    reviewFeedback: null,
    reviewedById: null,
    reviewedAt: null,
    approvedAt: null,
    suspendedAt: null,
    createdAt: new Date("2026-04-29T10:00:00.000Z"),
    updatedAt: new Date("2026-04-29T10:00:00.000Z"),
    institution
  };

  const service = new AdminService(
    {
      institution: {
        findUnique: async () => institution
      },
      developerAccessRequest: {
        findFirst: async () => null,
        create: async ({ data }) => ({ ...createdRequest, ...data }),
        findUnique: async () => createdRequest,
        update: async ({ data }) => ({ ...createdRequest, ...data, status: "APPROVED" })
      }
    },
    { write: async (event) => auditEvents.push(event) },
    {}
  );

  const request = await service.createDeveloperAccessRequest(founderAuth, {
    institutionId: institution.uuid,
    developerName: "Technical Registrar",
    developerEmail: "TECH@EXAMPLE.EDU.NG",
    reason: "Live Results API pilot for automated score publication.",
    requestedScopes: ["ingest:write", "govern:write"]
  });
  const approved = await service.approveDeveloperAccessRequest(founderAuth, request.uuid, "Approved for sandbox pilot.");

  assert.equal(request.status, "PENDING");
  assert.equal(request.developerEmail, "tech@example.edu.ng");
  assert.equal(approved.status, "APPROVED");
  assert.equal(auditEvents[0].action, "developer_access_request.create");
  assert.equal(auditEvents[1].action, "developer_access_request.approved");
});

test("institution API keys require approved developer access", async () => {
  const institution = {
    uuid: "11111111-1111-4111-8111-111111111111",
    institutionId: "AINi-00001",
    officialName: "AcadID Pilot School"
  };
  const service = new AdminService(
    {
      institution: {
        findUnique: async () => institution
      },
      developerAccessRequest: {
        findFirst: async () => null
      },
      apiKey: {
        create: async () => {
          throw new Error("API key should not be created without approved developer access");
        }
      }
    },
    { write: async () => undefined },
    { hash: () => "hashed" }
  );

  await assert.rejects(
    () =>
      service.createApiKey(founderAuth, institution.uuid, {
        label: "Live Results API",
        scopes: ["ingest:write"],
        environment: "SANDBOX",
        rateLimitPerMinute: 500
      }),
    BadRequestException
  );
});
