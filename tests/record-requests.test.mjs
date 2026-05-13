import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { AccessService } from "../apps/api/dist/apps/api/src/modules/gateway/access/access.service.js";
import { GovernanceService } from "../apps/api/dist/apps/api/src/modules/gateway/governance/governance.service.js";

function createRecordRequestHarness() {
  const auditEvents = [];
  const requests = [];
  const credentials = [];
  const revenueEntries = [];
  const invitationLeads = [];
  const institution = {
    uuid: "22222222-2222-4222-8222-222222222222",
    institutionId: "AINi-00001",
    officialName: "AcadID Pilot School",
    state: "Lagos",
    status: "ACTIVE"
  };
  const learner = {
    uuid: "11111111-1111-4111-8111-111111111111",
    ain: "AIN-NG-2026-0000001",
    fullName: "Ada Student",
    identityStatus: "VERIFIED"
  };
  const prisma = {
    recordRequest: {
      findUnique: async ({ where }) =>
        requests.find((request) => request.uuid === where.uuid || request.requestId === where.requestId) ?? null,
      create: async ({ data }) => {
        const row = {
          uuid: "record-request-1",
          institution: data.institutionId ? institution : null,
          learner: data.learnerId ? learner : null,
          assignedTo: null,
          fulfilledCredential: null,
          fulfilledCredentialId: null,
          paymentProvider: null,
          paymentHeldAt: null,
          paymentReleasedAt: null,
          refundRequestedAt: null,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        requests.push(row);
        return row;
      },
      findMany: async ({ where }) =>
        requests.filter((request) => !where?.learnerId || request.learnerId === where.learnerId),
      update: async ({ where, data }) => {
        const index = requests.findIndex((request) => request.uuid === where.uuid);
        const fulfilledCredential = data.fulfilledCredentialId
          ? credentials.find((credential) => credential.uuid === data.fulfilledCredentialId) ?? null
          : requests[index].fulfilledCredential;
        const row = { ...requests[index], ...data, fulfilledCredential, updatedAt: new Date() };
        requests[index] = row;
        return row;
      }
    },
    credential: {
      create: async ({ data }) => {
        const row = {
          uuid: `credential-${credentials.length + 1}`,
          status: "ACTIVE",
          issuedAt: new Date(),
          revokedAt: null,
          revocationReason: null,
          ...data
        };
        credentials.push(row);
        return row;
      }
    },
    revenueLedgerEntry: {
      create: async ({ data }) => {
        const row = { uuid: `revenue-${revenueEntries.length + 1}`, ...data };
        revenueEntries.push(row);
        return row;
      }
    },
    invitationLead: {
      findUnique: async ({ where }) =>
        invitationLeads.find((lead) => lead.uuid === where.uuid || lead.institutionNameKey === where.institutionNameKey) ?? null,
      create: async ({ data }) => {
        const row = {
          uuid: "invitation-lead-1",
          status: "NEW",
          lastContactedAt: null,
          invitedAt: null,
          dismissedAt: null,
          convertedAt: null,
          convertedInstitutionId: null,
          sourceApplicationId: null,
          reviewedById: null,
          reviewNote: null,
          stateHint: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        invitationLeads.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const index = invitationLeads.findIndex((lead) => lead.uuid === where.uuid);
        const current = invitationLeads[index];
        const row = {
          ...current,
          ...data,
          demandCount: typeof data.demandCount?.increment === "number" ? current.demandCount + data.demandCount.increment : data.demandCount ?? current.demandCount,
          requesterCount:
            typeof data.requesterCount?.increment === "number" ? current.requesterCount + data.requesterCount.increment : data.requesterCount ?? current.requesterCount,
          updatedAt: new Date()
        };
        invitationLeads[index] = row;
        return row;
      }
    },
    $transaction: async (callback) => callback(prisma)
  };
  const audit = { write: async (event) => auditEvents.push(event) };
  return { accessService: new AccessService(prisma, audit), auditEvents, credentials, institution, invitationLeads, learner, prisma, requests, revenueEntries };
}

test("learner creates a record request and governance can review it", async () => {
  const { accessService, auditEvents, invitationLeads, prisma } = createRecordRequestHarness();
  const studentAuth = {
    sub: "student-user",
    email: "student@example.com",
    fullName: "Ada Student",
    role: UserRole.STUDENT,
    learnerId: "11111111-1111-4111-8111-111111111111",
    iat: 1,
    exp: 2
  };

  const created = await accessService.createRecordRequest(studentAuth, {
    institutionNameSubmitted: "Old Federal Secondary School",
    educationLevel: "Secondary School",
    yearsAttendedFrom: 2015,
    yearsAttendedTo: 2021,
    studentNumber: "STU-001",
    departmentOrClass: "Science",
    recordTypesRequested: ["Transcript", "Testimonial"],
    proofDocumentUrls: ["s3://acadid-proof/example.pdf"]
  });

  assert.equal(created.accepted, true);
  assert.match(created.request.requestId, /^REQ-\d{4}-[A-F0-9]{8}$/);
  assert.equal(created.request.status, "SUBMITTED");
  assert.equal(created.request.paymentStatus, "NOT_REQUIRED");
  assert.equal(invitationLeads.length, 1);
  assert.equal(invitationLeads[0].institutionName, "Old Federal Secondary School");
  assert.equal(invitationLeads[0].latestRecordRequestCode, created.request.requestId);
  assert.equal(auditEvents.some((event) => event.action === "record_request.create"), true);
  assert.equal(auditEvents.some((event) => event.action === "invitation_lead.create"), true);

  const governance = new GovernanceService(
    prisma,
    { write: async (event) => auditEvents.push(event) },
    { institutionWhereForActor: async () => undefined, assertActorCanOperateInstitution: async () => undefined },
    { sign: async (payload) => ({ payload, proof: { type: "DataIntegrityProof" }, signature: "signed-record-request" }) }
  );
  const reviewed = await governance.reviewRecordRequest(
    {
      sub: "founder-user",
      email: "founder@acadid.local",
      fullName: "Founder Admin",
      role: UserRole.ACADID_SUPER_ADMIN,
      iat: 1,
      exp: 2
    },
    created.request.uuid,
    {
      status: "NEEDS_MORE_INFORMATION",
      note: "Upload a clearer proof document."
    }
  );

  assert.equal(reviewed.accepted, true);
  assert.equal(reviewed.request.status, "NEEDS_MORE_INFORMATION");
  assert.equal(reviewed.request.notes.length, 1);
  assert.equal(auditEvents.some((event) => event.action === "record_request.review"), true);
});

test("paid record request is held in escrow until fulfillment publishes credential", async () => {
  const previousFee = process.env.ACADID_RECORD_REQUEST_FEE_MINOR;
  process.env.ACADID_RECORD_REQUEST_FEE_MINOR = "150000";
  try {
    const { accessService, auditEvents, credentials, institution, prisma, revenueEntries } = createRecordRequestHarness();
    const studentAuth = {
      sub: "student-user",
      email: "student@example.com",
      fullName: "Ada Student",
      role: UserRole.STUDENT,
      learnerId: "11111111-1111-4111-8111-111111111111",
      iat: 1,
      exp: 2
    };

    const created = await accessService.createRecordRequest(studentAuth, {
      institutionId: institution.uuid,
      institutionNameSubmitted: institution.officialName,
      educationLevel: "Secondary School",
      yearsAttendedFrom: 2015,
      yearsAttendedTo: 2021,
      studentNumber: "STU-001",
      departmentOrClass: "Science",
      recordTypesRequested: ["Transcript"],
      proofDocumentUrls: ["storage://proof/example.pdf"]
    });

    assert.equal(created.request.status, "AWAITING_PAYMENT");
    assert.equal(created.request.paymentStatus, "PENDING");
    assert.equal(created.request.amountMinor, 150000);

    const governance = new GovernanceService(
      prisma,
      { write: async (event) => auditEvents.push(event) },
      {
        institutionWhereForActor: async () => ({ institutionId: { in: [institution.uuid] } }),
        assertActorCanOperateInstitution: async (_auth, institutionId) => assert.equal(institutionId, institution.uuid)
      },
      { sign: async (payload) => ({ payload, proof: { type: "DataIntegrityProof" }, signature: "signed-record-request" }) }
    );
    const registrarAuth = {
      sub: "registrar-user",
      email: "registrar@example.edu.ng",
      fullName: "Registrar",
      role: UserRole.REGISTRAR,
      institutionUuid: institution.uuid,
      institutionId: institution.institutionId,
      iat: 1,
      exp: 2
    };

    const paid = await governance.confirmRecordRequestPayment(registrarAuth, created.request.uuid, {
      paymentReference: "paystack-ref-001",
      amountMinor: 150000,
      paymentProvider: "PAYSTACK"
    });

    assert.equal(paid.request.paymentStatus, "PAID");
    assert.equal(paid.request.escrowStatus, "HELD");

    const fulfilled = await governance.fulfillRecordRequest(registrarAuth, created.request.uuid, {
      credentialType: "TRANSCRIPT",
      note: "Transcript approved and published."
    });

    assert.equal(fulfilled.accepted, true);
    assert.equal(fulfilled.request.status, "FULFILLED");
    assert.equal(fulfilled.request.escrowStatus, "RELEASED");
    assert.equal(credentials.length, 1);
    assert.equal(credentials[0].recordRequestId, created.request.uuid);
    assert.equal(credentials[0].type, "TRANSCRIPT");
    assert.equal(credentials[0].vcPayload.proof.type, "DataIntegrityProof");
    assert.equal(revenueEntries.length, 1);
    assert.equal(revenueEntries[0].category, "CREDENTIAL_EXPORT_FEE");
    assert.equal(revenueEntries[0].status, "PAID");
    assert.equal(auditEvents.some((event) => event.action === "record_request.payment_confirmed"), true);
    assert.equal(auditEvents.some((event) => event.action === "record_request.fulfill"), true);
  } finally {
    if (previousFee === undefined) delete process.env.ACADID_RECORD_REQUEST_FEE_MINOR;
    else process.env.ACADID_RECORD_REQUEST_FEE_MINOR = previousFee;
  }
});
