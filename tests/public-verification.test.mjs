import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { VerificationService } from "../apps/api/dist/apps/api/src/modules/gateway/verification/verification.service.js";

function createService() {
  const verificationEvents = [];
  const credential = {
    uuid: "credential-1",
    credentialRef: "CRED-001",
    status: "ACTIVE",
    issuedAt: new Date("2026-05-01T08:00:00.000Z"),
    revokedAt: null,
    revocationReason: null,
    signature: "header.payload.signature",
    vcPayload: {
      id: "urn:uuid:credential-1",
      proof: { jws: "header.payload.signature" }
    },
    institution: {
      uuid: "institution-1",
      institutionId: "AINI-0001",
      officialName: "Lagos State University"
    }
  };
  const learner = {
    uuid: "learner-1",
    ain: "AIN-NG-2026-0001",
    fullName: "Ada Lagos",
    identityStatus: "VERIFIED",
    credentials: [
      {
        uuid: "credential-1",
        credentialRef: "CRED-001",
        type: "RESULT_SUMMARY",
        status: "ACTIVE",
        issuedAt: new Date("2026-05-01T08:00:00.000Z"),
        institution: {
          institutionId: "AINI-0001",
          officialName: "Lagos State University"
        }
      }
    ]
  };
  const prisma = {
    credential: {
      findUnique: async ({ where }) => (where.credentialRef === "CRED-001" ? credential : null),
      count: async () => 1
    },
    learner: {
      findUnique: async ({ where }) => (where.ain === "AIN-NG-2026-0001" ? learner : null)
    },
    verificationEvent: {
      create: async ({ data }) => {
        verificationEvents.push(data);
        return { uuid: `verification-${verificationEvents.length}`, ...data };
      }
    },
    revenueLedgerEntry: {
      create: async () => {
        throw new Error("billing should not run without ACADID_VERIFICATION_FEE_MINOR");
      }
    }
  };
  const service = new VerificationService(prisma, {
    verify: async () => true
  });
  return { service, verificationEvents };
}

test("AIN lookup returns a safe learner and credential summary", async () => {
  const { service, verificationEvents } = createService();

  const response = await service.lookupAin(" AIN-NG-2026-0001 ", {
    verifierName: "Employer"
  });

  assert.equal(response.outcome, "CONFIRMED");
  assert.equal(response.learner.ain, "AIN-NG-2026-0001");
  assert.equal(response.learner.fullName, "Ada Lagos");
  assert.equal(response.credentialSummary.activeCredentialCount, 1);
  assert.equal(response.credentialSummary.credentials[0].credentialRef, "CRED-001");
  assert.equal("uuid" in response.credentialSummary.credentials[0], false);
  assert.equal("dateOfBirth" in response.learner, false);
  assert.equal(verificationEvents[0].verifierType, "AIN_LOOKUP");
});

test("bulk verification handles credential references and AINs through one gateway call", async () => {
  const { service } = createService();

  const response = await service.bulkVerify({
    credentialRefs: ["CRED-001", "CRED-001"],
    ains: ["AIN-NG-2026-0001"]
  });

  assert.equal(response.outcome, "COMPLETED");
  assert.equal(response.total, 2);
  assert.equal(response.confirmed, 2);
  assert.equal(response.credentials[0].credentialRef, "CRED-001");
  assert.equal("uuid" in response.credentials[0].result.credential, false);
  assert.equal("uuid" in response.credentials[0].result.credential.institution, false);
  assert.equal(response.learnerLookups[0].ain, "AIN-NG-2026-0001");
});

test("bulk verification rejects empty and oversized requests", async () => {
  const { service } = createService();

  await assert.rejects(() => service.bulkVerify({ credentialRefs: [] }), BadRequestException);
  await assert.rejects(
    () =>
      service.bulkVerify({
        credentialRefs: Array.from({ length: 51 }, (_, index) => `CRED-${index}`)
      }),
    BadRequestException
  );
});
