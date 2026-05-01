import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

test("founder dashboard summary returns aggregate metrics, usage, and audit events", async () => {
  const now = new Date("2026-05-01T08:00:00.000Z");
  const countCalls = [];
  const service = new AdminService(
    {
      institution: {
        count: async ({ where } = {}) => {
          countCalls.push(["institution", where]);
          if (where?.status === "ACTIVE") return 9;
          if (where?.status === "SUSPENDED") return 1;
          return 10;
        }
      },
      institutionApplication: {
        count: async () => 3
      },
      learner: {
        count: async () => 128542
      },
      academicRecord: {
        count: async () => 45782
      },
      credential: {
        count: async () => 38921
      },
      apiKey: {
        count: async () => 7
      },
      developerAccessRequest: {
        count: async ({ where }) => (where.status === "APPROVED" ? 4 : 2)
      },
      dispute: {
        count: async () => 5
      },
      verificationEvent: {
        count: async () => 11
      },
      auditEvent: {
        count: async () => 13,
        findMany: async () => [
          {
            uuid: "audit-1",
            action: "institution_application.approve",
            targetType: "InstitutionApplication",
            targetId: "application-1",
            outcome: "SUCCESS",
            reason: null,
            actorRole: "ACADID_SUPER_ADMIN",
            createdAt: now,
            institution: { uuid: "institution-1", institutionId: "AINi-00001", officialName: "Greenfield University" },
            actor: { uuid: "founder-1", fullName: "Founder Admin", email: "founder@acadid.local" }
          }
        ]
      }
    },
    {},
    {}
  );

  const summary = await service.readDashboardSummary();

  assert.equal(summary.metrics.totalInstitutions, 10);
  assert.equal(summary.metrics.activeLearners, 128542);
  assert.equal(summary.metrics.resultsPublished, 45782);
  assert.equal(summary.metrics.credentialsIssued, 38921);
  assert.equal(summary.metrics.pendingDeveloperRequests, 2);
  assert.equal(summary.institutionStatus.apiAccessActive, 4);
  assert.equal(summary.apiUsage.length, 7);
  assert.equal(summary.apiUsage[0].total, 24);
  assert.equal(summary.latestAuditEvents[0].label, "Institution Application Approve");
  assert.equal(summary.latestAuditEvents[0].institutionId, "AINi-00001");
  assert.equal(summary.latestAuditEvents[0].actorEmail, "founder@acadid.local");
  assert.equal(countCalls.some(([model]) => model === "institution"), true);
});

