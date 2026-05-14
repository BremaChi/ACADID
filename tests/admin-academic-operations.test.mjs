import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

test("founder academic operations summary aggregates v5 control-plane health", async () => {
  const institutionOne = {
    uuid: "11111111-1111-4111-8111-111111111111",
    institutionId: "AINi-00001",
    officialName: "AcadID Pilot School",
    state: "Lagos",
    status: "ACTIVE",
    tier: "FOUNDING"
  };
  const institutionTwo = {
    uuid: "22222222-2222-4222-8222-222222222222",
    institutionId: "AINi-00002",
    officialName: "Incomplete College",
    state: "Enugu",
    status: "ACTIVE",
    tier: "FOUNDING"
  };
  const prisma = {
    institution: {
      findMany: async () => [institutionOne, institutionTwo]
    },
    academicSession: {
      groupBy: async () => [
        { institutionId: institutionOne.uuid, status: "ACTIVE", _count: { _all: 1 } },
        { institutionId: institutionOne.uuid, status: "SEALED", _count: { _all: 1 } },
        { institutionId: institutionTwo.uuid, status: "DRAFT", _count: { _all: 1 } }
      ],
      findMany: async () => [
        {
          uuid: "sealed-session-1",
          institution: institutionOne,
          sessionLabel: "2025/2026",
          periodType: "TERM",
          periodLabel: "Third Term",
          isCurrent: false,
          updatedAt: new Date("2026-05-01T10:00:00.000Z")
        }
      ]
    },
    academicStructure: {
      groupBy: async ({ by }) => {
        if (by.includes("status")) {
          return [
            { institutionId: institutionOne.uuid, type: "CLASS", status: "ACTIVE", _count: { _all: 3 } },
            { institutionId: institutionOne.uuid, type: "SUBJECT", status: "ACTIVE", _count: { _all: 5 } },
            { institutionId: institutionTwo.uuid, type: "CLASS", status: "ACTIVE", _count: { _all: 1 } }
          ];
        }
        if (by.includes("type")) {
          return [
            { type: "CLASS", _count: { _all: 3 } },
            { type: "SUBJECT", _count: { _all: 5 } }
          ];
        }
        return [
          { institutionId: institutionOne.uuid, _count: { _all: 8 } },
          { institutionId: institutionTwo.uuid, _count: { _all: 1 } }
        ];
      }
    },
    gradingRuleSet: {
      groupBy: async () => [{ institutionId: institutionOne.uuid, status: "ACTIVE", _count: { _all: 1 } }]
    },
    institutionUser: {
      findMany: async () => [
        {
          uuid: "staff-1",
          institutionId: institutionOne.uuid,
          role: "REGISTRAR",
          status: "ACTIVE",
          assignedScopes: [],
          user: { fullName: "Registrar One", email: "registrar@example.edu.ng" }
        },
        {
          uuid: "staff-2",
          institutionId: institutionTwo.uuid,
          role: "DATA_ENTRY_OFFICER",
          status: "ACTIVE",
          assignedScopes: [],
          user: { fullName: "Data Officer", email: "data@example.edu.ng" }
        }
      ]
    },
    enrolment: {
      groupBy: async () => [{ institutionId: institutionOne.uuid, status: "ACTIVE", _count: { _all: 120 } }]
    },
    resultBatch: {
      groupBy: async () => [
        { institutionId: institutionOne.uuid, status: "PUBLISHED", _count: { _all: 4 } },
        { institutionId: institutionTwo.uuid, status: "REJECTED", _count: { _all: 2 } }
      ]
    },
    rolloverRecord: {
      groupBy: async () => [
        { institutionId: institutionOne.uuid, status: "APPROVED", _count: { _all: 2 } },
        { institutionId: institutionTwo.uuid, status: "PENDING_ROLLOVER", _count: { _all: 1 } }
      ],
      findMany: async () => [
        {
          uuid: "rollover-1",
          decision: "PROMOTED",
          status: "APPROVED",
          createdAt: new Date("2026-05-01T09:00:00.000Z"),
          institution: institutionOne,
          learner: { uuid: "learner-1", ain: "AIN-NG-2026-0000001", fullName: "Ada Learner" },
          fromSession: { uuid: "session-1", sessionLabel: "2025/2026", periodLabel: "Third Term", status: "SEALED" },
          toSession: { uuid: "session-2", sessionLabel: "2026/2027", periodLabel: "First Term", status: "ACTIVE" },
          fromStructure: { uuid: "class-1", type: "CLASS", name: "SS1", code: "SS1" },
          toStructure: { uuid: "class-2", type: "CLASS", name: "SS2", code: "SS2" }
        }
      ]
    },
    transferRequest: {
      groupBy: async () => [
        { fromInstitutionId: institutionOne.uuid, status: "COMPLETED", _count: { _all: 2 } },
        { fromInstitutionId: institutionTwo.uuid, status: "DISPUTED", _count: { _all: 1 } }
      ],
      findMany: async () => [
        {
          uuid: "transfer-1",
          transferId: "TRF-2026-ABC123",
          status: "DISPUTED",
          toInstitutionNameSubmitted: "Future Academy",
          createdAt: new Date("2026-05-01T12:00:00.000Z"),
          learner: { uuid: "learner-1", ain: "AIN-NG-2026-0000001", fullName: "Ada Learner" },
          fromInstitution: institutionTwo,
          toInstitution: null,
          rolloverRecord: { uuid: "rollover-2", decision: "TRANSFERRED_OUT", status: "APPROVED" },
          dispute: { uuid: "dispute-1", title: "Transfer disputed", status: "OPEN", priority: "HIGH" }
        }
      ]
    },
    backgroundJob: {
      findMany: async () => [
        {
          uuid: "job-1",
          institutionId: institutionTwo.uuid,
          type: "RESULT_BATCH_VALIDATION",
          status: "RUNNING",
          queue: "validation",
          progress: 20,
          attempts: 1,
          error: null,
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          startedAt: new Date("2026-05-01T10:00:00.000Z"),
          updatedAt: new Date("2026-05-01T10:05:00.000Z")
        }
      ]
    },
    importFile: {
      groupBy: async () => [{ institutionId: institutionOne.uuid, kind: "student_register", _count: { _all: 2 } }]
    },
    mouDocument: {
      groupBy: async () => [{ institutionId: institutionOne.uuid, _count: { _all: 1 } }]
    },
    recordRequest: {
      findMany: async () => [{ institutionId: institutionOne.uuid, proofDocumentUrls: ["storage://bucket/proof-a.pdf", "storage://bucket/proof-b.pdf"] }]
    },
    institutionApplication: {
      findMany: async () => [{ approvedInstitutionId: institutionOne.uuid, documentUploads: { mou: "storage://bucket/mou.pdf" } }]
    },
    sealedSessionReopenRequest: {
      findMany: async () => [
        {
          uuid: "reopen-request-1",
          status: "REQUESTED",
          requestedStatus: "ACTIVE",
          reason: "Need approved correction.",
          reviewReason: null,
          dueAt: new Date("2026-05-04T11:00:00.000Z"),
          reviewedAt: null,
          createdAt: new Date("2026-05-01T11:00:00.000Z"),
          institution: { uuid: institutionOne.uuid, institutionId: institutionOne.institutionId, officialName: institutionOne.officialName, state: institutionOne.state },
          session: { uuid: "sealed-session-1", sessionLabel: "2025/2026", periodType: "TERM", periodLabel: "Third Term", status: "SEALED" },
          requestedBy: { uuid: "membership-1", role: "REGISTRAR", user: { fullName: "Registrar One", email: "registrar@example.edu.ng" } },
          reviewedBy: null
        }
      ]
    },
    auditEvent: {
      findMany: async () => [
        {
          uuid: "audit-1",
          requestId: "req-1",
          actorType: "USER",
          actorUserId: "founder-1",
          clientId: null,
          action: "academic_session.reopen_requested",
          targetType: "AcademicSession",
          targetId: "sealed-session-1",
          entityType: null,
          entityId: null,
          outcome: "SUCCESS",
          reason: "Need approved correction.",
          actorRole: "REGISTRAR",
          role: "REGISTRAR",
          endpoint: "/api/govern/sealed-sessions/sealed-session-1/reopen-request",
          httpMethod: "POST",
          ipAddressHash: "hash",
          userAgentHash: "hash",
          createdAt: new Date("2026-05-01T11:00:00.000Z"),
          institution: { uuid: institutionOne.uuid, institutionId: institutionOne.institutionId, officialName: institutionOne.officialName },
          actor: { uuid: "registrar-1", fullName: "Registrar One", email: "registrar@example.edu.ng" }
        }
      ]
    }
  };

  const service = new AdminService(prisma, {}, {});
  const summary = await service.readAcademicOperations();

  assert.equal(summary.metrics.activeSessions, 1);
  assert.equal(summary.metrics.sealedSessions, 1);
  assert.equal(summary.metrics.structureNodes, 9);
  assert.equal(summary.metrics.pendingRollovers, 1);
  assert.equal(summary.metrics.disputedTransfers, 1);
  assert.equal(summary.metrics.institutionsMissingGradingRules, 1);
  assert.equal(summary.metrics.institutionsMissingSubjectsOrCourses, 1);
  assert.equal(summary.metrics.institutionsWithUnscopedStaff, 1);
  assert.equal(summary.metrics.storageObjects, 6);
  assert.equal(summary.metrics.reopenEscalations, 1);
  assert.equal(summary.institutionHealth.find((item) => item.institutionId === "AINi-00001").completionScore, 100);
  assert.equal(summary.institutionHealth.find((item) => item.institutionId === "AINi-00002").flags.includes("Missing active session"), true);
  assert.equal(summary.institutionHealth.find((item) => item.institutionId === "AINi-00002").flags.includes("Missing grading rules"), true);
  assert.equal(summary.institutionHealth.find((item) => item.institutionId === "AINi-00002").unscopedStaff, 1);
  assert.equal(summary.recentRollovers[0].learnerAin, "AIN-NG-2026-0000001");
  assert.equal(summary.recentTransfers[0].transferId, "TRF-2026-ABC123");
  assert.equal(summary.sealedSessionEscalations[0].actorName, "Registrar One");
  assert.equal(summary.sealedSessionEscalations[0].status, "REQUESTED");
  assert.equal(summary.sealedSessionEscalations[0].sessionLabel, "2025/2026");
});
