import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { AccessService } from "../apps/api/dist/apps/api/src/modules/gateway/access/access.service.js";
import { GovernanceService } from "../apps/api/dist/apps/api/src/modules/gateway/governance/governance.service.js";

test("publishing tertiary results recomputes durable CGPA and classification", async () => {
  const standings = [];
  const credentials = [];
  const institution = {
    uuid: "22222222-2222-4222-8222-222222222222",
    institutionId: "AINi-00001",
    authorityGrants: []
  };
  const enrolment = {
    uuid: "33333333-3333-4333-8333-333333333333",
    learnerId: "11111111-1111-4111-8111-111111111111",
    institutionId: institution.uuid
  };
  const records = [
    {
      uuid: "record-1",
      enrolmentId: enrolment.uuid,
      enrolment,
      academicSessionId: "session-1",
      periodLabel: "First Semester",
      subjectCode: "MTH101",
      subjectName: "Calculus I",
      totalScore: 72,
      grade: "A",
      gradePoint: 5,
      creditUnits: 3,
      qualityPoints: 15,
      gradingRuleSetId: "rule-1",
      gradingRuleSet: { engine: "TERTIARY_GPA", gradePointMax: 5 },
      publishedAt: new Date("2026-05-14T09:00:00.000Z"),
      createdAt: new Date("2026-05-14T09:00:00.000Z")
    },
    {
      uuid: "record-2",
      enrolmentId: enrolment.uuid,
      enrolment,
      academicSessionId: "session-1",
      periodLabel: "First Semester",
      subjectCode: "PHY101",
      subjectName: "General Physics",
      totalScore: 64,
      grade: "B",
      gradePoint: 4,
      creditUnits: 2,
      qualityPoints: 8,
      gradingRuleSetId: "rule-1",
      gradingRuleSet: { engine: "TERTIARY_GPA", gradePointMax: 5 },
      publishedAt: new Date("2026-05-14T09:00:00.000Z"),
      createdAt: new Date("2026-05-14T09:00:00.000Z")
    }
  ];
  const batch = {
    uuid: "batch-1",
    institutionId: institution.uuid,
    status: "APPROVED",
    institution,
    academicRecords: records
  };
  const prisma = {
    resultBatch: {
      findUnique: async () => batch,
      update: async ({ data }) => ({ ...batch, ...data })
    },
    academicRecord: {
      updateMany: async () => ({ count: records.length }),
      findMany: async () => records
    },
    credential: {
      create: async ({ data }) => {
        credentials.push(data);
        return { uuid: `credential-${credentials.length}`, ...data };
      }
    },
    enrolment: {
      findUnique: async ({ where }) => (where.uuid === enrolment.uuid ? enrolment : null)
    },
    academicStanding: {
      upsert: async ({ create, update }) => {
        const row = { uuid: "standing-1", ...(standings.length === 0 ? create : update) };
        standings[0] = row;
        return row;
      }
    },
    $transaction: async (callback) => callback(prisma)
  };
  const service = new GovernanceService(
    prisma,
    { write: async () => undefined },
    {
      assertInstitutionCan: async () => ({ institutionUuid: institution.uuid, institutionId: institution.institutionId }),
      assertActorCanOperateInstitution: async () => undefined
    },
    { sign: async (payload) => ({ payload, proof: { type: "DataIntegrityProof" }, signature: "signed" }) }
  );

  const published = await service.publishBatch(
    {
      sub: "founder-user",
      email: "founder@acadid.local",
      fullName: "Founder Admin",
      role: UserRole.ACADID_SUPER_ADMIN,
      iat: 1,
      exp: 2
    },
    batch.uuid
  );

  assert.equal(published.status, "PUBLISHED");
  assert.equal(credentials.length, 2);
  assert.equal(standings[0].enrolmentId, enrolment.uuid);
  assert.equal(standings[0].attemptedCreditUnits, 5);
  assert.equal(standings[0].qualityPoints, 23);
  assert.equal(standings[0].cgpa, 4.6);
  assert.equal(standings[0].gradePointMax, 5);
  assert.equal(standings[0].classification, "First Class");
  assert.equal(standings[0].includedRecordCount, 2);
  assert.equal(standings[0].periodCount, 1);
});

test("student access exposes academic standing from the learner passport boundary", async () => {
  const service = new AccessService(
    {
      academicStanding: {
        findMany: async ({ where }) => {
          assert.equal(where.learnerId, "11111111-1111-4111-8111-111111111111");
          return [
            {
              uuid: "standing-1",
              cgpa: 4.6,
              gradePointMax: 5,
              classification: "First Class",
              classificationSystem: "NIGERIAN_TERTIARY_5_POINT",
              attemptedCreditUnits: 5,
              earnedCreditUnits: 5,
              qualityPoints: 23,
              includedRecordCount: 2,
              periodCount: 1,
              latestPeriodLabel: "First Semester",
              computedAt: new Date("2026-05-14T09:00:00.000Z"),
              institution: { institutionId: "AINi-00001", officialName: "AcadID Pilot University" },
              enrolment: { studentNumber: "STU-001", level: "100", programme: "BSc Computer Science", status: "ACTIVE" }
            }
          ];
        }
      }
    },
    { write: async () => undefined }
  );

  const standings = await service.academicStanding({
    sub: "student-user",
    email: "student@example.com",
    fullName: "Ada Student",
    role: UserRole.STUDENT,
    learnerId: "11111111-1111-4111-8111-111111111111",
    iat: 1,
    exp: 2
  });

  assert.equal(standings.length, 1);
  assert.equal(standings[0].cgpa, 4.6);
  assert.equal(standings[0].classification, "First Class");
});
