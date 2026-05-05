import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { AuthService } from "../apps/api/dist/apps/api/src/modules/auth/auth.service.js";
import { PasswordService } from "../apps/api/dist/apps/api/src/modules/auth/password.service.js";

function createInstitutionAuthHarness() {
  const passwordService = new PasswordService();
  const auditEvents = [];
  const institution = {
    uuid: "11111111-1111-4111-8111-111111111111",
    institutionId: "AINi-00001",
    officialName: "AcadID Pilot School",
    status: "ACTIVE"
  };
  const founder = {
    uuid: "00000000-0000-4000-8000-000000000001",
    email: "founder@acadid.local",
    fullName: "Founder Admin",
    phone: null,
    role: UserRole.ACADID_SUPER_ADMIN,
    learnerId: null,
    passwordHash: passwordService.hash("ChangeMe123!"),
    mfaEnabled: false,
    totpSecretEncrypted: null,
    institutions: []
  };
  const users = new Map([[founder.email, founder]]);
  const memberships = new Map();

  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        const user = where.email ? users.get(where.email) : Array.from(users.values()).find((candidate) => candidate.uuid === where.uuid);
        if (!user) return null;
        return {
          ...user,
          institutions: Array.from(memberships.values())
            .filter((membership) => membership.userId === user.uuid)
            .map((membership) => ({
              ...membership,
              institution
            }))
        };
      },
      upsert: async ({ where, update, create }) => {
        const existing = users.get(where.email);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = {
          uuid: `user-${users.size + 1}`,
          learnerId: null,
          mfaEnabled: false,
          totpSecretEncrypted: null,
          institutions: [],
          ...create
        };
        users.set(created.email, created);
        return created;
      },
      update: async ({ where, data }) => {
        const user = Array.from(users.values()).find((candidate) => candidate.uuid === where.uuid);
        Object.assign(user, data);
        return user;
      }
    },
    institution: {
      findFirst: async ({ where }) => {
        if (where.uuid === institution.uuid || where.institutionId === institution.institutionId) return institution;
        return null;
      },
      findUnique: async () => institution
    },
    institutionUser: {
      upsert: async ({ where, update, create, include }) => {
        const key = `${where.userId_institutionId_role.userId}:${where.userId_institutionId_role.institutionId}:${where.userId_institutionId_role.role}`;
        const existing = memberships.get(key);
        const row = existing ? { ...existing, ...update } : { uuid: `membership-${memberships.size + 1}`, ...create };
        memberships.set(key, row);
        return include ? { ...row, user: Array.from(users.values()).find((user) => user.uuid === row.userId), institution } : row;
      },
      findUnique: async ({ where, include }) => {
        const row = Array.from(memberships.values()).find((membership) => membership.inviteTokenHash === where.inviteTokenHash);
        return row && include ? { ...row, user: Array.from(users.values()).find((user) => user.uuid === row.userId), institution } : row ?? null;
      },
      update: async ({ where, data, include }) => {
        const entry = Array.from(memberships.entries()).find(([, membership]) => membership.uuid === where.uuid);
        if (!entry) return null;
        const [key, row] = entry;
        const updated = { ...row, ...data };
        memberships.set(key, updated);
        return include ? { ...updated, user: Array.from(users.values()).find((user) => user.uuid === updated.userId), institution } : updated;
      }
    },
    mfaRecoveryCode: {
      findMany: async () => []
    },
    $transaction: async (callback) => callback(prisma)
  };

  const service = new AuthService(
    prisma,
    passwordService,
    {
      sign: (payload) => Buffer.from(JSON.stringify(payload)).toString("base64url")
    },
    {
      decryptSecret: () => "totp-secret",
      verifyCode: () => true
    },
    {
      write: async (event) => auditEvents.push(event)
    }
  );

  return { auditEvents, institution, memberships, service, users };
}

test("founder invites registrar, invitee accepts, and institution login carries workspace scope", async () => {
  const { auditEvents, institution, service } = createInstitutionAuthHarness();
  const founderAuth = {
    sub: "00000000-0000-4000-8000-000000000001",
    email: "founder@acadid.local",
    fullName: "Founder Admin",
    role: UserRole.ACADID_SUPER_ADMIN,
    iat: 1,
    exp: 2
  };

  const invite = await service.inviteInstitutionUser(founderAuth, {
    institutionId: institution.institutionId,
    fullName: "Registrar One",
    email: "registrar@example.edu.ng",
    role: "REGISTRAR"
  });

  assert.equal(invite.invitation.status, "INVITED");
  assert.equal(invite.invitation.role, "REGISTRAR");
  assert.match(invite.inviteToken, /^inv_/);

  const accepted = await service.acceptInstitutionInvite({
    token: invite.inviteToken,
    password: "StrongPass123!"
  });

  assert.equal(accepted.accepted, true);
  assert.equal(accepted.role, "REGISTRAR");

  const login = await service.login("registrar@example.edu.ng", "StrongPass123!");

  assert.equal(login.user.institution.institutionId, institution.institutionId);
  assert.equal(login.user.role, "REGISTRAR");
  assert.equal(login.user.institution.permissions.includes("govern:publish"), true);
  assert.equal(auditEvents.some((event) => event.action === "institution_user.invite"), true);
  assert.equal(auditEvents.some((event) => event.action === "institution_user.invite.accept"), true);
  assert.equal(auditEvents.some((event) => event.action === "auth.login" && event.institutionId === institution.uuid), true);
});

