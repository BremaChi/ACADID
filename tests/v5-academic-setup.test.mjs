import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { IngestionService } from "../apps/api/dist/apps/api/src/modules/gateway/ingestion/ingestion.service.js";

function createHarness() {
  const auditEvents = [];
  const institution = {
    uuid: "11111111-1111-4111-8111-111111111111",
    institutionId: "AINi-00001",
    officialName: "AcadID Pilot School",
    status: "ACTIVE"
  };
  const sessions = new Map();
  const structures = new Map();

  const prisma = {
    institution: {
      findFirst: async ({ where }) => {
        if (where.uuid === institution.uuid || where.institutionId === institution.institutionId) return institution;
        return null;
      }
    },
    institutionUser: {
      findFirst: async () => ({ uuid: "membership-1" }),
      findMany: async () => [{ institutionId: institution.uuid }]
    },
    academicSession: {
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }) => {
        const row = {
          uuid: `session-${sessions.size + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        sessions.set(row.uuid, row);
        return row;
      },
      findMany: async ({ where }) => Array.from(sessions.values()).filter((row) => !where?.institutionId || row.institutionId === where.institutionId)
    },
    academicStructure: {
      findUnique: async ({ where }) => structures.get(where.uuid) ?? null,
      create: async ({ data }) => {
        const row = {
          uuid: `22222222-2222-4222-8222-22222222222${structures.size}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        structures.set(row.uuid, row);
        return row;
      },
      findMany: async ({ where }) => Array.from(structures.values()).filter((row) => !where?.institutionId || row.institutionId === where.institutionId)
    },
    $transaction: async (callback) => callback(prisma)
  };

  const service = new IngestionService(
    prisma,
    {
      assertActorCanOperateInstitution: async (auth, institutionId) => {
        assert.equal(institutionId, institution.uuid);
        if (auth.kind === "API_KEY") throw new ForbiddenException("API key is not assigned to this institution.");
      },
      institutionWhereForActor: async () => ({ institutionId: { in: [institution.uuid] } })
    },
    {
      write: async (event) => auditEvents.push(event)
    }
  );

  const auth = {
    sub: "registrar-user",
    email: "registrar@example.edu.ng",
    fullName: "Registrar",
    role: UserRole.REGISTRAR,
    institutionUuid: institution.uuid,
    institutionId: institution.institutionId,
    institutionUserId: "membership-1",
    permissions: ["academic_setup:write", "academic_setup:read"],
    iat: 1,
    exp: 2
  };

  return { auditEvents, auth, institution, service, sessions, structures };
}

test("registrar creates and lists academic sessions", async () => {
  const { auditEvents, auth, institution, service } = createHarness();

  const created = await service.createAcademicSession(auth, {
    institutionId: institution.institutionId,
    sessionLabel: "2026/2027",
    periodType: "TERM",
    periodLabel: "First Term",
    status: "ACTIVE",
    isCurrent: true
  });

  assert.equal(created.accepted, true);
  assert.equal(created.session.institutionId, institution.uuid);
  assert.equal(created.session.isCurrent, true);

  const sessions = await service.listAcademicSessions(auth, institution.institutionId);
  assert.equal(sessions.length, 1);
  assert.equal(auditEvents.some((event) => event.action === "academic_session.create"), true);
});

test("registrar creates structure nodes with same-institution parent enforcement", async () => {
  const { auth, institution, service } = createHarness();

  const level = await service.createAcademicStructure(auth, {
    institutionId: institution.institutionId,
    type: "LEVEL",
    name: "SS1"
  });

  const subject = await service.createAcademicStructure(auth, {
    institutionId: institution.institutionId,
    parentId: level.structure.uuid,
    type: "SUBJECT",
    name: "Physics",
    code: "PHY"
  });

  assert.equal(subject.accepted, true);
  assert.equal(subject.structure.parentId, level.structure.uuid);
  assert.equal(subject.structure.code, "PHY");
});

test("machine API key cannot perform academic setup human actions", async () => {
  const { institution, service } = createHarness();

  await assert.rejects(
    () =>
      service.createAcademicSession(
        {
          sub: "api-key",
          email: "api-key@acadid.local",
          fullName: "Product Key",
          role: UserRole.REGISTRAR,
          kind: "API_KEY",
          institutionUuid: institution.uuid,
          institutionId: institution.institutionId,
          scopes: ["academic_setup:write"],
          iat: 1,
          exp: 2
        },
        {
          institutionId: institution.institutionId,
          sessionLabel: "2026/2027",
          periodType: "TERM",
          periodLabel: "First Term"
        }
      ),
    ForbiddenException
  );
});
