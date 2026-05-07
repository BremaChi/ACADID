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
        if (by.includes("type")) {
          return [
            { type: "CLASS", _count: { _all: 3 } },
            { type: "SUBJECT", _count: { _all: 5 } }
          ];
        }
        return [{ institutionId: institutionOne.uuid, _count: { _all: 8 } }];
      }
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
  assert.equal(summary.metrics.structureNodes, 8);
  assert.equal(summary.metrics.pendingRollovers, 1);
  assert.equal(summary.metrics.reopenEscalations, 1);
  assert.equal(summary.institutionHealth.find((item) => item.institutionId === "AINi-00001").completionScore, 100);
  assert.equal(summary.institutionHealth.find((item) => item.institutionId === "AINi-00002").flags.includes("Missing active session"), true);
  assert.equal(summary.recentRollovers[0].learnerAin, "AIN-NG-2026-0000001");
  assert.equal(summary.sealedSessionEscalations[0].actorName, "Registrar One");
});
