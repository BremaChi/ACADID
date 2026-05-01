import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { AuthService } from "../apps/api/dist/apps/api/src/modules/auth/auth.service.js";
import { PasswordService } from "../apps/api/dist/apps/api/src/modules/auth/password.service.js";

function createAuthHarness() {
  const passwordService = new PasswordService();
  const auditEvents = [];
  const recoveryRows = [];
  const user = {
    uuid: "00000000-0000-0000-0000-000000000001",
    email: "founder@acadid.local",
    fullName: "Founder Admin",
    role: UserRole.ACADID_SUPER_ADMIN,
    learnerId: null,
    passwordHash: passwordService.hash("ChangeMe123!"),
    mfaEnabled: true,
    totpSecretEncrypted: "encrypted-secret"
  };
  const prisma = {
    user: {
      findUnique: async () => user
    },
    mfaRecoveryCode: {
      count: async ({ where }) => recoveryRows.filter((row) => row.userId === where.userId && row.usedAt === where.usedAt).length,
      findFirst: async ({ where }) => {
        const rows = recoveryRows.filter((row) => row.userId === where.userId);
        return rows.length ? { createdAt: rows[rows.length - 1].createdAt } : null;
      },
      findMany: async ({ where }) => recoveryRows.filter((row) => row.userId === where.userId && row.usedAt === where.usedAt),
      updateMany: async ({ where, data }) => {
        const row = recoveryRows.find((candidate) => candidate.uuid === where.uuid && candidate.usedAt === where.usedAt);
        if (row) row.usedAt = data.usedAt;
        return { count: row ? 1 : 0 };
      },
      deleteMany: ({ where }) => {
        for (let index = recoveryRows.length - 1; index >= 0; index -= 1) {
          if (recoveryRows[index].userId === where.userId) recoveryRows.splice(index, 1);
        }
        return Promise.resolve({ count: 1 });
      },
      createMany: ({ data }) => {
        data.forEach((row, index) => {
          recoveryRows.push({
            uuid: `recovery-${index}`,
            userId: row.userId,
            codeHash: row.codeHash,
            usedAt: null,
            createdAt: new Date("2026-05-01T08:00:00.000Z")
          });
        });
        return Promise.resolve({ count: data.length });
      }
    },
    $transaction: async (operations) => Promise.all(operations)
  };
  const service = new AuthService(
    prisma,
    passwordService,
    {
      sign: (payload) => `token:${payload.sub}`
    },
    {
      decryptSecret: () => "totp-secret",
      verifyCode: (_secret, code) => code === "123456"
    },
    {
      write: async (event) => {
        auditEvents.push(event);
      }
    }
  );

  return { auditEvents, passwordService, prisma, recoveryRows, service, user };
}

test("founder can rotate hashed recovery codes after TOTP verification", async () => {
  const { auditEvents, recoveryRows, service, user } = createAuthHarness();

  const response = await service.rotateRecoveryCodes({ sub: user.uuid, role: UserRole.ACADID_SUPER_ADMIN }, "123456");

  assert.equal(response.recoveryCodes.length, 10);
  assert.equal(recoveryRows.length, 10);
  assert.equal(recoveryRows[0].codeHash.includes(response.recoveryCodes[0].replaceAll("-", "")), false);
  assert.equal(auditEvents[0].action, "founder_mfa.recovery_codes.rotate");
});

test("founder can sign in once with a recovery code", async () => {
  const { recoveryRows, service, user } = createAuthHarness();
  const rotated = await service.rotateRecoveryCodes({ sub: user.uuid, role: UserRole.ACADID_SUPER_ADMIN }, "123456");

  const login = await service.login("founder@acadid.local", "ChangeMe123!", undefined, rotated.recoveryCodes[0]);

  assert.equal(login.user.email, "founder@acadid.local");
  assert.equal(recoveryRows.filter((row) => row.usedAt).length, 1);
  await assert.rejects(
    () => service.login("founder@acadid.local", "ChangeMe123!", undefined, rotated.recoveryCodes[0]),
    /Invalid authenticator code/
  );
});

test("founder recovery code rotation rejects invalid TOTP", async () => {
  const { service, user } = createAuthHarness();

  await assert.rejects(
    () => service.rotateRecoveryCodes({ sub: user.uuid, role: UserRole.ACADID_SUPER_ADMIN }, "000000"),
    /Valid authenticator code is required/
  );
});
