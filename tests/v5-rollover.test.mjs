import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { GovernanceService } from "../apps/api/dist/apps/api/src/modules/gateway/governance/governance.service.js";

const institution = {
  uuid: "11111111-1111-4111-8111-111111111111",
  institutionId: "AINi-00001",
  officialName: "AcadID Pilot School",
  status: "ACTIVE"
};
const fromSessionId = "22222222-2222-4222-8222-222222222222";
const toSessionId = "33333333-3333-4333-8333-333333333333";
const fromStructureId = "44444444-4444-4444-8444-444444444444";
const toStructureId = "55555555-5555-4555-8555-555555555555";
const enrolmentId = "66666666-6666-4666-8666-666666666666";
const learnerId = "77777777-7777-4777-8777-777777777777";

function createHarness() {
  const auditEvents = [];
  const rollovers = [];
  const enrolments = new Map([
    [
      enrolmentId,
      {
        uuid: enrolmentId,
        learnerId,
        institutionId: institution.uuid,
        academicSessionId: fromSessionId,
        structureScopeId: fromStructureId,
        studentNumber: "STU-001",
        level: "SS1",
        programme: "Science",
        entryDate: new Date("2025-09-01T00:00:00.000Z"),
        exitDate: null,
        exitType: null,
        status: "ACTIVE",
        learner: {
          uuid: learnerId,
          ain: "AIN-NG-2026-0000001",
          fullName: "Ada Learner",
          identityStatus: "UNVERIFIED"
        },
        structureScope: {
          uuid: fromStructureId,
          type: "CLASS",
          name: "SS1",
          code: "SS1"
        },
        rolloverRecords: []
      }
    ]
  ]);
  const sessions = new Map([
    [fromSessionId, { uuid: fromSessionId, institutionId: institution.uuid, status: "ACTIVE" }],
    [toSessionId, { uuid: toSessionId, institutionId: institution.uuid, status: "ACTIVE" }]
  ]);
  const structures = new Map([
    [fromStructureId, { uuid: fromStructureId, institutionId: institution.uuid, status: "ACTIVE", name: "SS1" }],
    [toStructureId, { uuid: toStructureId, institutionId: institution.uuid, status: "ACTIVE", name: "SS2" }]
  ]);

  const prisma = {
    institution: {
      findFirst: async ({ where }) => {
        if (where.uuid === institution.uuid || where.institutionId === institution.institutionId) return institution;
        return null;
      }
    },
    academicSession: {
      findUnique: async ({ where }) => sessions.get(where.uuid) ?? null
    },
    academicStructure: {
      findUnique: async ({ where }) => structures.get(where.uuid) ?? null
    },
    enrolment: {
      findMany: async ({ where }) =>
        Array.from(enrolments.values()).filter(
          (row) =>
            (!where.uuid?.in || where.uuid.in.includes(row.uuid)) &&
            row.institutionId === where.institutionId &&
            row.academicSessionId === where.academicSessionId &&
            row.status === where.status &&
            (!where.structureScopeId || row.structureScopeId === where.structureScopeId)
        ),
      update: async ({ where, data }) => {
        const row = enrolments.get(where.uuid);
        const updated = { ...row, ...data };
        enrolments.set(where.uuid, updated);
        return updated;
      },
      create: async ({ data }) => {
        const row = {
          uuid: `88888888-8888-4888-8888-88888888888${enrolments.size}`,
          exitDate: null,
          exitType: null,
          ...data
        };
        enrolments.set(row.uuid, row);
        return row;
      }
    },
    rolloverRecord: {
      findMany: async ({ where }) =>
        rollovers.filter((row) => where.enrolmentId.in.includes(row.enrolmentId) && row.fromSessionId === where.fromSessionId),
      create: async ({ data }) => {
        const row = {
          uuid: `99999999-9999-4999-8999-99999999999${rollovers.length}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        rollovers.push(row);
        return row;
      }
    },
    $transaction: async (callback) => callback(prisma)
  };

  const auth = {
    sub: "registrar-user",
    email: "registrar@example.edu.ng",
    fullName: "Registrar",
    role: UserRole.REGISTRAR,
    institutionUserId: "99999999-9999-4999-8999-999999999999",
    iat: 1,
    exp: 2
  };

  const service = new GovernanceService(
    prisma,
    { write: async (event) => auditEvents.push(event) },
    { assertActorCanOperateInstitution: async () => undefined, institutionWhereForActor: async () => ({ institutionId: institution.uuid }) },
    {}
  );

  return { auditEvents, auth, enrolments, rollovers, service };
}

test("registrar previews eligible rollover candidates without changing enrolments", async () => {
  const { auditEvents, auth, enrolments, service } = createHarness();

  const preview = await service.previewRollover(auth, {
    institutionId: institution.institutionId,
    fromSessionId,
    toSessionId,
    fromStructureId,
    toStructureId,
    decision: "PROMOTED"
  });

  assert.equal(preview.accepted, true);
  assert.equal(preview.count, 1);
  assert.equal(preview.candidates[0].ain, "AIN-NG-2026-0000001");
  assert.equal(enrolments.get(enrolmentId).status, "ACTIVE");
  assert.equal(auditEvents.some((event) => event.action === "rollover.preview"), true);
});

test("registrar confirms promotion rollover and creates next active enrolment", async () => {
  const { auditEvents, auth, enrolments, rollovers, service } = createHarness();

  const confirmed = await service.confirmRollover(auth, {
    institutionId: institution.institutionId,
    fromSessionId,
    toSessionId,
    fromStructureId,
    toStructureId,
    decisions: [{ enrolmentId, decision: "PROMOTED", reason: "Passed promotion review." }]
  });

  assert.equal(confirmed.accepted, true);
  assert.equal(confirmed.confirmedCount, 1);
  assert.equal(enrolments.get(enrolmentId).status, "PROMOTED");
  assert.equal(rollovers[0].status, "APPROVED");
  assert.equal(rollovers[0].decision, "PROMOTED");
  assert.equal(enrolments.get(confirmed.rollovers[0].newEnrolmentId).academicSessionId, toSessionId);
  assert.equal(enrolments.get(confirmed.rollovers[0].newEnrolmentId).level, "SS2");
  assert.equal(auditEvents.some((event) => event.action === "rollover.confirm"), true);
});

test("promotion rollover requires a target academic session", async () => {
  const { auth, service } = createHarness();

  await assert.rejects(
    () =>
      service.confirmRollover(auth, {
        institutionId: institution.institutionId,
        fromSessionId,
        decisions: [{ enrolmentId, decision: "PROMOTED" }]
      }),
    BadRequestException
  );
});

test("machine keys cannot confirm manual rollovers", async () => {
  const { service } = createHarness();

  await assert.rejects(
    () =>
      service.previewRollover(
        {
          sub: "api-key",
          email: "api-key@acadid.local",
          fullName: "API Key",
          role: UserRole.REGISTRAR,
          kind: "API_KEY",
          iat: 1,
          exp: 2
        },
        {
          institutionId: institution.institutionId,
          fromSessionId
        }
      ),
    ForbiddenException
  );
});

function createSealedSessionHarness() {
  const auditEvents = [];
  let reopenRequest = null;
  let sealedSession = {
    uuid: fromSessionId,
    institutionId: institution.uuid,
    sessionLabel: "2025/2026",
    periodType: "TERM",
    periodLabel: "Third Term",
    status: "SEALED",
    institution
  };
  const prisma = {
    academicSession: {
      findUnique: async ({ where }) => (where.uuid === sealedSession.uuid ? sealedSession : null),
      update: async ({ where, data }) => {
        if (where.uuid !== sealedSession.uuid) return null;
        sealedSession = { ...sealedSession, ...data };
        return sealedSession;
      }
    },
    sealedSessionReopenRequest: {
      findFirst: async ({ where }) => (reopenRequest?.sessionId === where.sessionId && reopenRequest?.status === where.status ? reopenRequest : null),
      create: async ({ data }) => {
        reopenRequest = {
          uuid: "reopen-request-1",
          status: "REQUESTED",
          createdAt: new Date("2026-05-14T10:00:00.000Z"),
          updatedAt: new Date("2026-05-14T10:00:00.000Z"),
          institution,
          session: sealedSession,
          requestedBy: { uuid: data.requestedById, role: "REGISTRAR", user: { fullName: "Registrar", email: "registrar@example.edu.ng" } },
          reviewedBy: null,
          ...data
        };
        return reopenRequest;
      },
      update: async ({ where, data }) => {
        if (where.uuid !== reopenRequest?.uuid) return null;
        reopenRequest = {
          ...reopenRequest,
          ...data,
          updatedAt: new Date("2026-05-14T10:30:00.000Z"),
          reviewedBy: { uuid: data.reviewedById, fullName: "Founder", email: "founder@acadid.local", role: "ACADID_SUPER_ADMIN" }
        };
        return reopenRequest;
      }
    }
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const service = new GovernanceService(
    prisma,
    { write: async (event) => auditEvents.push(event) },
    { assertActorCanOperateInstitution: async () => undefined, institutionWhereForActor: async () => ({ institutionId: institution.uuid }) },
    {}
  );
  const registrarAuth = {
    sub: "registrar-user",
    email: "registrar@example.edu.ng",
    fullName: "Registrar",
    role: UserRole.REGISTRAR,
    institutionUserId: "99999999-9999-4999-8999-999999999999",
    iat: 1,
    exp: 2
  };
  const founderAuth = {
    sub: "founder-user",
    email: "founder@acadid.local",
    fullName: "Founder",
    role: UserRole.ACADID_SUPER_ADMIN,
    iat: 1,
    exp: 2
  };
  return { auditEvents, founderAuth, registrarAuth, reopenRequest: () => reopenRequest, service };
}

test("registrar escalates sealed-session reopen request and founder approves it", async () => {
  const { auditEvents, founderAuth, registrarAuth, reopenRequest, service } = createSealedSessionHarness();

  const requested = await service.requestSealedSessionReopen(registrarAuth, fromSessionId, {
    reason: "Need approved correction after registrar review.",
    requestedStatus: "ACTIVE"
  });
  const reviewed = await service.reviewSealedSessionReopen(founderAuth, fromSessionId, {
    decision: "APPROVE",
    reason: "Correction window approved for audited amendment.",
    newStatus: "ACTIVE"
  });

  assert.equal(requested.status, "REQUESTED");
  assert.equal(requested.requestId, "reopen-request-1");
  assert.equal(reviewed.status, "ACTIVE");
  assert.equal(reviewed.requestStatus, "APPROVED");
  assert.equal(reopenRequest().status, "APPROVED");
  assert.equal(auditEvents.some((event) => event.action === "academic_session.reopen_requested"), true);
  assert.equal(auditEvents.some((event) => event.action === "academic_session.reopen_approved"), true);
});

test("non-founder cannot review sealed-session reopen requests", async () => {
  const { registrarAuth, service } = createSealedSessionHarness();

  await assert.rejects(
    () =>
      service.reviewSealedSessionReopen(registrarAuth, fromSessionId, {
        decision: "APPROVE",
        reason: "Trying to bypass founder review.",
        newStatus: "ACTIVE"
      }),
    ForbiddenException
  );
});
