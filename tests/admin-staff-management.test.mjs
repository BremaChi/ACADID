import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

function makeStaff(overrides = {}) {
  return {
    uuid: "staff-1",
    institutionId: "institution-1",
    role: "EXAM_OFFICER",
    status: "ACTIVE",
    permissions: ["students:read"],
    assignedScopes: [{ level: "SS1" }],
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
      email: "exam@example.com",
      fullName: "Exam Officer",
      phone: null,
      mfaEnabled: true
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

test("founder lists institution staff without invite token material", async () => {
  const staff = makeStaff({ inviteTokenHash: "secret-token-hash" });
  const service = new AdminService(
    {
      institution: {
        findUnique: async () => ({ uuid: "institution-1" })
      },
      institutionUser: {
        findMany: async () => [staff]
      }
    },
    {},
    {}
  );

  const [member] = await service.listInstitutionStaff("institution-1");

  assert.equal(member.user.email, "exam@example.com");
  assert.deepEqual(member.assignedScopes, [{ level: "SS1" }]);
  assert.equal("inviteTokenHash" in member, false);
});

test("founder updates institution staff status, permissions, scope, and audits it", async () => {
  const auditEvents = [];
  const service = new AdminService(
    {
      institutionUser: {
        findUnique: async () => ({
          uuid: "staff-1",
          institutionId: "institution-1",
          role: "EXAM_OFFICER",
          status: "ACTIVE",
          permissions: ["students:read"],
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
    },
    {}
  );

  const member = await service.updateInstitutionStaff(
    { sub: "founder-1", role: "ACADID_SUPER_ADMIN", kind: "USER" },
    "staff-1",
    {
      status: "SUSPENDED",
      permissions: ["students:read", "results:read"],
      assignedScopes: [{ level: "SS2", subject: "Physics" }],
      twoFactorRequired: true
    }
  );

  assert.equal(member.status, "SUSPENDED");
  assert.equal(member.twoFactorRequired, true);
  assert.deepEqual(member.permissions, ["students:read", "results:read"]);
  assert.deepEqual(member.assignedScopes, [{ level: "SS2", subject: "Physics" }]);
  assert.equal(auditEvents[0].action, "institution_user.update");
  assert.equal(auditEvents[0].targetId, "staff-1");
});
