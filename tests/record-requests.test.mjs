import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { AccessService } from "../apps/api/dist/apps/api/src/modules/gateway/access/access.service.js";
import { GovernanceService } from "../apps/api/dist/apps/api/src/modules/gateway/governance/governance.service.js";

function createRecordRequestHarness() {
  const auditEvents = [];
  const requests = [];
  const prisma = {
    recordRequest: {
      findUnique: async ({ where }) =>
        requests.find((request) => request.uuid === where.uuid || request.requestId === where.requestId) ?? null,
      create: async ({ data }) => {
        const row = {
          uuid: "record-request-1",
          institution: null,
          learner: null,
          assignedTo: null,
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
        const row = { ...requests[index], ...data, updatedAt: new Date() };
        requests[index] = row;
        return row;
      }
    }
  };
  const audit = { write: async (event) => auditEvents.push(event) };
  return { accessService: new AccessService(prisma, audit), auditEvents, prisma, requests };
}

test("learner creates a record request and governance can review it", async () => {
  const { accessService, auditEvents, prisma } = createRecordRequestHarness();
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
  assert.equal(created.request.paymentStatus, "PENDING");
  assert.equal(auditEvents.some((event) => event.action === "record_request.create"), true);

  const governance = new GovernanceService(
    prisma,
    { write: async (event) => auditEvents.push(event) },
    { institutionWhereForActor: async () => undefined, assertActorCanOperateInstitution: async () => undefined },
    {}
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
