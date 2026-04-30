import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

test("founder verification logs are flattened without secret material", async () => {
  const service = new AdminService(
    {
      verificationEvent: {
        findMany: async ({ where, take }) => {
          assert.equal(where.outcome, "CONFIRMED");
          assert.equal(take, 500);
          return [
            {
              uuid: "verification-1",
              verifierType: "CREDENTIAL_REFERENCE",
              verifierName: "Employer HR",
              outcome: "CONFIRMED",
              verifiedAt: new Date("2026-04-30T10:00:00.000Z"),
              scopeViewed: {
                credentialRef: "CRED-001",
                cryptographicStatus: "VALID"
              },
              credential: {
                uuid: "credential-1",
                credentialRef: "CRED-001",
                type: "RESULT_SLIP",
                status: "ACTIVE",
                learner: {
                  uuid: "learner-1",
                  ain: "AIN-NG-2026-0000001",
                  fullName: "Ada Learner"
                },
                institution: {
                  uuid: "institution-1",
                  institutionId: "AINi-00001",
                  officialName: "AcadID Pilot School",
                  state: "Lagos"
                }
              },
              accessGrant: null
            }
          ];
        }
      }
    },
    {},
    {}
  );

  const [log] = await service.listVerificationLogs({ outcome: "CONFIRMED", search: "Ada" });

  assert.equal(log.id, "verification-1");
  assert.equal(log.ain, "AIN-NG-2026-0000001");
  assert.equal(log.learnerName, "Ada Learner");
  assert.equal(log.institutionName, "AcadID Pilot School");
  assert.equal(log.verifier, "Employer HR");
  assert.equal(log.credential, "CRED-001");
  assert.equal(log.scopeShown, "status:VALID");
  assert.equal("verifierEmailEncrypted" in log, false);
  assert.equal("ipAddressHash" in log, false);
});
