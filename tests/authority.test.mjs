import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import {
  AuthorityService,
  permissionAllows
} from "../apps/api/dist/apps/api/src/modules/platform/services/authority.service.js";

test("permissionAllows supports all, named boolean, and permission arrays", () => {
  assert.equal(permissionAllows({ all: true }, "publish_credentials"), true);
  assert.equal(permissionAllows({ publish_credentials: true }, "publish_credentials"), true);
  assert.equal(permissionAllows({ allowed: ["ingest_students"] }, "ingest_students"), true);
  assert.equal(permissionAllows({ permissions: ["ingest_results"] }, "ingest_results"), true);
  assert.equal(permissionAllows({ allowed: ["ingest_students"] }, "publish_credentials"), false);
  assert.equal(permissionAllows(null, "publish_credentials"), false);
});

test("super admins can operate any institution without membership lookup", async () => {
  const service = new AuthorityService({
    institutionUser: {
      findFirst: async () => {
        throw new Error("membership lookup should not run for super admin");
      }
    }
  });

  await service.assertActorCanOperateInstitution(
    {
      sub: "admin-user",
      email: "founder@acadid.local",
      fullName: "Founder",
      role: "ACADID_SUPER_ADMIN",
      iat: 1,
      exp: 2
    },
    "institution-1"
  );
});

test("institution staff are denied when they are not assigned to the institution", async () => {
  const service = new AuthorityService({
    institutionUser: {
      findFirst: async () => null
    }
  });

  await assert.rejects(
    () =>
      service.assertActorCanOperateInstitution(
        {
          sub: "registrar-user",
          email: "registrar@school.test",
          fullName: "Registrar",
          role: "REGISTRAR",
          iat: 1,
          exp: 2
        },
        "institution-1"
      ),
    ForbiddenException
  );
});

test("institution staff must have an active workspace membership", async () => {
  const service = new AuthorityService({
    institutionUser: {
      findFirst: async ({ where }) => {
        assert.equal(where.status, "ACTIVE");
        assert.deepEqual(where.institution, { status: "ACTIVE" });
        return null;
      }
    }
  });

  await assert.rejects(
    () =>
      service.assertActorCanOperateInstitution(
        {
          sub: "registrar-user",
          email: "registrar@school.test",
          fullName: "Registrar",
          role: "REGISTRAR",
          institutionUserId: "membership-1",
          iat: 1,
          exp: 2
        },
        "institution-1"
      ),
    ForbiddenException
  );
});

test("workspace helpers scope institution users to active memberships only", async () => {
  const service = new AuthorityService({
    institutionUser: {
      findMany: async ({ where }) => {
        assert.equal(where.userId, "registrar-user");
        assert.equal(where.role, "REGISTRAR");
        assert.equal(where.status, "ACTIVE");
        assert.deepEqual(where.institution, { status: "ACTIVE" });
        return [{ institutionId: "institution-1" }, { institutionId: "institution-2" }];
      }
    }
  });

  const auth = {
    sub: "registrar-user",
    email: "registrar@school.test",
    fullName: "Registrar",
    role: "REGISTRAR",
    iat: 1,
    exp: 2
  };

  assert.deepEqual(await service.workspaceScopeForActor(auth), {
    mode: "INSTITUTION",
    institutionIds: ["institution-1", "institution-2"],
    primaryInstitutionId: "institution-1"
  });
  assert.deepEqual(await service.institutionWhereForActor(auth), {
    institutionId: { in: ["institution-1", "institution-2"] }
  });
});
