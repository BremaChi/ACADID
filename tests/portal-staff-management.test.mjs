import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { PortalService } from "../apps/api/dist/apps/api/src/modules/portal/portal.service.js";

function makeStaff(overrides = {}) {
  return {
    uuid: "staff-1",
    institutionId: "institution-1",
    role: "DATA_ENTRY_OFFICER",
    status: "ACTIVE",
    permissions: ["ingest:write"],
    assignedScopes: [{ level: "SS1", subject: "Mathematics" }],
    twoFactorRequired: false,
    invitedAt: null,
    inviteExpiresAt: null,
    inviteAcceptedAt: null,
    lastLoginAt: null,
    suspendedAt: null,
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    user: {
      uuid: "user-1",
      email: "data@example.edu.ng",
      fullName: "Data Officer",
      phone: null,
      mfaEnabled: false
    },
    invitedBy: null,
    institution: {
      uuid: "institution-1",
      institutionId: "AINi-00001",
      officialName: "AcadID Pilot School"
    },
    ...overrides
  };
}

function makeRegistrarAuth(overrides = {}) {
  return {
    sub: "registrar-user",
    email: "registrar@example.edu.ng",
    fullName: "Registrar One",
    role: UserRole.REGISTRAR,
    kind: "USER",
    institutionUuid: "institution-1",
    institutionId: "AINi-00001",
    institutionName: "AcadID Pilot School",
    institutionUserId: "registrar-membership",
    permissions: ["staff:manage", "academic_setup:read"],
    assignedScopes: [],
    iat: 1,
    exp: 2,
    ...overrides
  };
}

test("registrar lists institution staff and scope options inside own workspace", async () => {
  const service = new PortalService({
    institutionUser: {
      findMany: async ({ where }) => {
        assert.equal(where.institutionId, "institution-1");
        return [makeStaff({ inviteTokenHash: "secret-hash" })];
      }
    },
    academicSession: {
      findMany: async ({ where }) => {
        assert.equal(where.institutionId, "institution-1");
        return [{ uuid: "session-1", sessionLabel: "2026/2027", periodType: "TERM", periodLabel: "First Term", status: "ACTIVE", isCurrent: true }];
      }
    },
    academicStructure: {
      findMany: async ({ where }) => {
        assert.equal(where.institutionId, "institution-1");
        return [{ uuid: "structure-1", parentId: null, type: "SUBJECT", name: "Mathematics", code: "MTH", creditUnits: null, metadata: {} }];
      }
    }
  });

  const staff = await service.listStaff(makeRegistrarAuth());
  const scopeOptions = await service.readStaffScopeOptions(makeRegistrarAuth());

  assert.equal(staff[0].user.email, "data@example.edu.ng");
  assert.equal("inviteTokenHash" in staff[0], false);
  assert.deepEqual(staff[0].assignedScopes, [{ level: "SS1", subject: "Mathematics" }]);
  assert.equal(scopeOptions.sessions[0].sessionLabel, "2026/2027");
  assert.equal(scopeOptions.structures[0].code, "MTH");
});

test("registrar updates staff scopes and status with audit trail", async () => {
  const auditEvents = [];
  const service = new PortalService(
    {
      institutionUser: {
        findUnique: async () => ({
          uuid: "staff-1",
          institutionId: "institution-1",
          role: "DATA_ENTRY_OFFICER",
          status: "ACTIVE",
          permissions: ["ingest:write"],
          assignedScopes: [],
          twoFactorRequired: false
        }),
        update: async ({ data }) =>
          makeStaff({
            ...data,
            status: data.status,
            permissions: data.permissions,
            assignedScopes: data.assignedScopes,
            twoFactorRequired: data.twoFactorRequired
          })
      }
    },
    {
      write: async (event) => auditEvents.push(event)
    }
  );

  const member = await service.updateStaff(makeRegistrarAuth(), "staff-1", {
    status: "SUSPENDED",
    permissions: ["ingest:write", "results:draft"],
    assignedScopes: [{ level: "SS2", subject: "Physics" }],
    twoFactorRequired: true
  });

  assert.equal(member.status, "SUSPENDED");
  assert.equal(member.twoFactorRequired, true);
  assert.deepEqual(member.assignedScopes, [{ level: "SS2", subject: "Physics" }]);
  assert.equal(auditEvents[0].action, "portal.institution_user.update");
  assert.equal(auditEvents[0].institutionId, "institution-1");
});

test("portal staff management blocks machine keys and registrar membership changes", async () => {
  const service = new PortalService({
    institutionUser: {
      findUnique: async () => ({
        uuid: "staff-registrar",
        institutionId: "institution-1",
        role: "REGISTRAR",
        status: "ACTIVE",
        permissions: ["staff:manage"],
        assignedScopes: [],
        twoFactorRequired: false
      })
    }
  });

  await assert.rejects(
    () => service.listStaff(makeRegistrarAuth({ kind: "API_KEY", permissions: undefined, scopes: ["staff:manage"] })),
    /Human institution session is required/
  );
  await assert.rejects(() => service.updateStaff(makeRegistrarAuth(), "staff-registrar", { status: "SUSPENDED" }), /founder approval/);
});

