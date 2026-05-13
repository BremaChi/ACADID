import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { GovernanceService } from "../apps/api/dist/apps/api/src/modules/gateway/governance/governance.service.js";

const institution = {
  uuid: "11111111-1111-4111-8111-111111111111",
  institutionId: "AINi-00001",
  officialName: "AcadID Pilot School",
  state: "Lagos",
  status: "ACTIVE"
};
const targetInstitution = {
  uuid: "22222222-2222-4222-8222-222222222222",
  institutionId: "AINi-00002",
  officialName: "Receiving Pilot School",
  state: "Oyo",
  status: "ACTIVE"
};
const fromSessionId = "33333333-3333-4333-8333-333333333333";
const fromStructureId = "44444444-4444-4444-8444-444444444444";
const enrolmentId = "55555555-5555-4555-8555-555555555555";
const learnerId = "66666666-6666-4666-8666-666666666666";
const transferId = "77777777-7777-4777-8777-777777777777";
const rolloverId = "88888888-8888-4888-8888-888888888888";
const disputeId = "99999999-9999-4999-8999-999999999999";

function createHarness() {
  const auditEvents = [];
  const disputes = [];
  const rollovers = [];
  let transfer = null;
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
        academicSession: {
          uuid: fromSessionId,
          sessionLabel: "2025/2026",
          periodLabel: "Third Term",
          status: "ACTIVE"
        },
        structureScope: {
          uuid: fromStructureId,
          type: "CLASS",
          name: "SS1",
          code: "SS1"
        }
      }
    ]
  ]);

  const withTransferInclude = (row) =>
    row && {
      ...row,
      learner: enrolments.get(row.fromEnrolmentId)?.learner,
      fromInstitution: institution,
      toInstitution: row.toInstitutionId ? targetInstitution : null,
      fromEnrolment: enrolments.get(row.fromEnrolmentId),
      fromSession: enrolments.get(row.fromEnrolmentId)?.academicSession,
      fromStructure: enrolments.get(row.fromEnrolmentId)?.structureScope,
      requestedBy: null,
      reviewedBy: null,
      rolloverRecord: rollovers.find((rollover) => rollover.uuid === row.rolloverRecordId) ?? null,
      dispute: disputes.find((dispute) => dispute.uuid === row.disputeId) ?? null
    };

  const prisma = {
    institution: {
      findFirst: async ({ where }) => {
        if (where.uuid === institution.uuid || where.institutionId === institution.institutionId) return institution;
        if (where.uuid === targetInstitution.uuid || where.institutionId === targetInstitution.institutionId) return targetInstitution;
        return null;
      },
      findUnique: async ({ where }) => {
        if (where.uuid === institution.uuid) return institution;
        if (where.uuid === targetInstitution.uuid) return targetInstitution;
        return null;
      }
    },
    enrolment: {
      findUnique: async ({ where }) => enrolments.get(where.uuid) ?? null,
      update: async ({ where, data }) => {
        const row = enrolments.get(where.uuid);
        const updated = { ...row, ...data };
        enrolments.set(where.uuid, updated);
        return updated;
      }
    },
    transferRequest: {
      create: async ({ data }) => {
        transfer = {
          uuid: transferId,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        return withTransferInclude(transfer);
      },
      findUnique: async ({ where }) => (where.uuid === transfer?.uuid ? withTransferInclude(transfer) : null),
      findMany: async () => (transfer ? [withTransferInclude(transfer)] : []),
      update: async ({ where, data }) => {
        if (where.uuid !== transfer?.uuid) return null;
        transfer = { ...transfer, ...data, updatedAt: new Date() };
        return withTransferInclude(transfer);
      }
    },
    rolloverRecord: {
      create: async ({ data }) => {
        const row = {
          uuid: rolloverId,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        rollovers.push(row);
        return row;
      },
      findUnique: async ({ where }) => {
        const row = rollovers.find((rollover) => rollover.uuid === where.uuid);
        return row
          ? {
              ...row,
              institution,
              learner: enrolments.get(row.enrolmentId)?.learner,
              dispute: disputes.find((dispute) => dispute.uuid === row.disputeId) ?? null,
              transferRequest: transfer?.rolloverRecordId === row.uuid ? withTransferInclude(transfer) : null
            }
          : null;
      },
      update: async ({ where, data }) => {
        const index = rollovers.findIndex((rollover) => rollover.uuid === where.uuid);
        rollovers[index] = { ...rollovers[index], ...data, updatedAt: new Date() };
        return rollovers[index];
      }
    },
    dispute: {
      create: async ({ data }) => {
        const row = {
          uuid: disputeId,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        disputes.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const index = disputes.findIndex((dispute) => dispute.uuid === where.uuid);
        disputes[index] = { ...disputes[index], ...data, updatedAt: new Date() };
        return disputes[index];
      }
    },
    $transaction: async (callback) => callback(prisma)
  };

  const auth = {
    sub: "registrar-user",
    email: "registrar@example.edu.ng",
    fullName: "Registrar",
    role: UserRole.REGISTRAR,
    institutionUuid: institution.uuid,
    institutionUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    iat: 1,
    exp: 2
  };

  const service = new GovernanceService(
    prisma,
    { write: async (event) => auditEvents.push(event) },
    { assertActorCanOperateInstitution: async () => undefined, institutionWhereForActor: async () => ({ institutionId: institution.uuid }) },
    {}
  );

  return { auditEvents, auth, disputes, enrolments, rollovers, service };
}

test("registrar creates and approves a transfer request with a rollover record", async () => {
  const { auditEvents, auth, enrolments, rollovers, service } = createHarness();

  const created = await service.createTransferRequest(auth, {
    institutionId: institution.institutionId,
    enrolmentId,
    toInstitutionId: targetInstitution.uuid,
    reason: "Learner is relocating to another approved school."
  });
  const reviewed = await service.reviewTransferRequest(auth, created.transfer.uuid, {
    decision: "APPROVE",
    note: "Transfer approved after registrar review."
  });

  assert.equal(created.accepted, true);
  assert.match(created.transfer.transferId, /^TRF-\d{4}-/);
  assert.equal(reviewed.accepted, true);
  assert.equal(reviewed.transfer.status, "COMPLETED");
  assert.equal(enrolments.get(enrolmentId).status, "TRANSFERRED_OUT");
  assert.equal(enrolments.get(enrolmentId).exitType, "TRANSFER");
  assert.equal(rollovers[0].decision, "TRANSFERRED_OUT");
  assert.equal(auditEvents.some((event) => event.action === "transfer_request.create"), true);
  assert.equal(auditEvents.some((event) => event.action === "transfer_request.complete"), true);
});

test("rollover dispute opens and resolves against linked transfer state", async () => {
  const { auditEvents, auth, disputes, service } = createHarness();

  const created = await service.createTransferRequest(auth, {
    institutionId: institution.institutionId,
    enrolmentId,
    toInstitutionNameSubmitted: "Future Academy",
    reason: "Learner is moving to a new city."
  });
  const reviewed = await service.reviewTransferRequest(auth, created.transfer.uuid, {
    decision: "APPROVE",
    note: "Transfer approved with external destination."
  });
  const disputed = await service.createRolloverDispute(auth, reviewed.rollover.uuid, {
    reason: "Guardian says the learner should not have been transferred.",
    priority: "HIGH"
  });
  const resolved = await service.resolveRolloverDispute(auth, reviewed.rollover.uuid, {
    resolutionNote: "Registrar confirmed parent consent and retained evidence."
  });

  assert.equal(disputed.dispute.status, "OPEN");
  assert.equal(disputed.transfer.status, "DISPUTED");
  assert.equal(resolved.dispute.status, "RESOLVED");
  assert.equal(resolved.transfer.status, "COMPLETED");
  assert.equal(disputes[0].category, "ROLLOVER");
  assert.equal(auditEvents.some((event) => event.action === "rollover.dispute.create"), true);
  assert.equal(auditEvents.some((event) => event.action === "rollover.dispute.resolve"), true);
});

test("transfer request requires an approved target institution or submitted destination", async () => {
  const { auth, service } = createHarness();

  await assert.rejects(
    () =>
      service.createTransferRequest(auth, {
        institutionId: institution.institutionId,
        enrolmentId,
        reason: "Trying to submit without a destination."
      }),
    BadRequestException
  );
});
