import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

const founderAuth = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "founder@acadid.local",
  fullName: "Founder",
  role: "ACADID_SUPER_ADMIN",
  iat: 1,
  exp: 2
};

test("founder can manage dispute lifecycle with audit events", async () => {
  const auditEvents = [];
  const baseDispute = {
    uuid: "22222222-2222-4222-8222-222222222222",
    title: "Credential name mismatch",
    description: "Learner reported that the published credential name does not match school records.",
    category: "CREDENTIAL",
    priority: "HIGH",
    status: "OPEN",
    institutionId: "33333333-3333-4333-8333-333333333333",
    learnerId: null,
    credentialId: null,
    reporterName: "Ada Learner",
    reporterEmail: "ada@example.com",
    assignedToId: null,
    institutionNotice: null,
    noticeSentAt: null,
    escalatedAt: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: new Date("2026-04-30T09:00:00.000Z"),
    updatedAt: new Date("2026-04-30T09:00:00.000Z"),
    institution: { officialName: "AcadID Pilot School" },
    learner: null,
    credential: null,
    assignedTo: null
  };

  const service = new AdminService(
    {
      dispute: {
        create: async ({ data }) => ({ ...baseDispute, ...data }),
        update: async ({ data }) => ({ ...baseDispute, ...data }),
        findMany: async () => [baseDispute]
      }
    },
    { write: async (event) => auditEvents.push(event) },
    {}
  );

  const created = await service.createDispute(founderAuth, {
    title: baseDispute.title,
    description: baseDispute.description,
    category: "credential",
    priority: "HIGH",
    institutionId: baseDispute.institutionId,
    reporterName: baseDispute.reporterName,
    reporterEmail: "ADA@EXAMPLE.COM"
  });
  const assigned = await service.assignDispute(founderAuth, created.uuid, {});
  const noticed = await service.sendDisputeNotice(founderAuth, created.uuid, {
    message: "Please review this dispute and provide supporting evidence."
  });
  const escalated = await service.escalateDispute(founderAuth, created.uuid, {
    reason: "Founder priority review is required."
  });
  const closed = await service.closeDispute(founderAuth, created.uuid, {
    resolutionNote: "Institution corrected the record and learner confirmed the update."
  });

  assert.equal(created.category, "CREDENTIAL");
  assert.equal(created.reporterEmail, "ada@example.com");
  assert.equal(assigned.assignedToId, founderAuth.sub);
  assert.equal(noticed.institutionNotice, "Please review this dispute and provide supporting evidence.");
  assert.equal(escalated.status, "ESCALATED");
  assert.equal(closed.status, "RESOLVED");
  assert.equal(closed.resolutionNote, "Institution corrected the record and learner confirmed the update.");
  assert.deepEqual(
    auditEvents.map((event) => event.action),
    ["dispute.create", "dispute.assign", "dispute.notice.send", "dispute.escalate", "dispute.close"]
  );
});
