import assert from "node:assert/strict";
import test from "node:test";
import { VerificationService } from "../apps/api/dist/apps/api/src/modules/gateway/verification/verification.service.js";

function createService() {
  const revenueEntries = [];
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
  const prisma = {
    credential: {
      findUnique: async () => credential
    },
    verificationEvent: {
      create: async ({ data }) => ({
        uuid: "verification-1",
        ...data
      })
    },
    revenueLedgerEntry: {
      create: async ({ data }) => {
        revenueEntries.push(data);
        return { uuid: "revenue-1", ...data };
      }
    }
  };
  const service = new VerificationService(prisma, {
    verify: async () => true
  });
  return { revenueEntries, service };
}

test("credential reference verification writes billing event when fee is configured", async () => {
  const previousFee = process.env.ACADID_VERIFICATION_FEE_MINOR;
  process.env.ACADID_VERIFICATION_FEE_MINOR = "25000";
  try {
    const { revenueEntries, service } = createService();

    await service.verifyReference("CRED-001", { verifierName: "Employer" });

    assert.equal(revenueEntries.length, 1);
    assert.equal(revenueEntries[0].category, "VERIFICATION_FEE");
    assert.equal(revenueEntries[0].amountMinor, 25000);
    assert.equal(revenueEntries[0].institutionId, "institution-1");
    assert.equal(revenueEntries[0].sourceId, "verification-1");
  } finally {
    if (previousFee === undefined) delete process.env.ACADID_VERIFICATION_FEE_MINOR;
    else process.env.ACADID_VERIFICATION_FEE_MINOR = previousFee;
  }
});

test("credential reference verification skips billing when fee is not configured", async () => {
  const previousFee = process.env.ACADID_VERIFICATION_FEE_MINOR;
  delete process.env.ACADID_VERIFICATION_FEE_MINOR;
  try {
    const { revenueEntries, service } = createService();

    await service.verifyReference("CRED-001", { verifierName: "Employer" });

    assert.equal(revenueEntries.length, 0);
  } finally {
    if (previousFee !== undefined) process.env.ACADID_VERIFICATION_FEE_MINOR = previousFee;
  }
});
