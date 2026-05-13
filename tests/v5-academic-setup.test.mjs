import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { IngestionService } from "../apps/api/dist/apps/api/src/modules/gateway/ingestion/ingestion.service.js";

function createHarness() {
  const auditEvents = [];
  const institution = {
    uuid: "11111111-1111-4111-8111-111111111111",
    institutionId: "AINi-00001",
    officialName: "AcadID Pilot School",
    status: "ACTIVE"
  };
  const sessions = new Map();
  const structures = new Map();
  const gradingRuleSets = new Map();
  const resultBatches = new Map();
  const academicRecords = [];
  const enrolments = [
    {
      uuid: "33333333-3333-4333-8333-333333333331",
      institutionId: institution.uuid,
      studentNumber: "STU-001",
      status: "ACTIVE"
    },
    {
      uuid: "33333333-3333-4333-8333-333333333332",
      institutionId: institution.uuid,
      studentNumber: "STU-002",
      status: "ACTIVE"
    }
  ];

  const prisma = {
    institution: {
      findFirst: async ({ where }) => {
        if (where.uuid === institution.uuid || where.institutionId === institution.institutionId) return institution;
        return null;
      }
    },
    institutionUser: {
      findFirst: async () => ({ uuid: "membership-1" }),
      findMany: async () => [{ institutionId: institution.uuid }]
    },
    academicSession: {
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }) => {
        const row = {
          uuid: `session-${sessions.size + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        sessions.set(row.uuid, row);
        return row;
      },
      findUnique: async ({ where }) => sessions.get(where.uuid) ?? null,
      findMany: async ({ where }) => Array.from(sessions.values()).filter((row) => !where?.institutionId || row.institutionId === where.institutionId)
    },
    academicStructure: {
      findUnique: async ({ where }) => structures.get(where.uuid) ?? null,
      create: async ({ data }) => {
        const row = {
          uuid: `22222222-2222-4222-8222-22222222222${structures.size}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        structures.set(row.uuid, row);
        return row;
      },
      findMany: async ({ where }) => Array.from(structures.values()).filter((row) => !where?.institutionId || row.institutionId === where.institutionId)
    },
    gradingRuleSet: {
      create: async ({ data }) => {
        const row = {
          uuid: `44444444-4444-4444-8444-44444444444${gradingRuleSets.size}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        gradingRuleSets.set(row.uuid, row);
        return row;
      },
      findMany: async ({ where }) =>
        Array.from(gradingRuleSets.values()).filter((row) => !where?.institutionId || row.institutionId === where.institutionId),
      findUnique: async ({ where }) => gradingRuleSets.get(where.uuid) ?? null,
      findFirst: async ({ where }) =>
        Array.from(gradingRuleSets.values()).find(
          (row) => row.institutionId === where.institutionId && row.engine === where.engine && row.status === where.status
        ) ?? null,
      update: async ({ where, data }) => {
        const existing = gradingRuleSets.get(where.uuid);
        const row = { ...existing, ...data, updatedAt: new Date() };
        gradingRuleSets.set(where.uuid, row);
        return row;
      }
    },
    enrolment: {
      findMany: async ({ where }) =>
        enrolments.filter(
          (row) =>
            row.institutionId === where.institutionId &&
            row.status === where.status &&
            where.studentNumber.in.includes(row.studentNumber)
        )
    },
    resultBatch: {
      create: async ({ data }) => {
        const row = {
          uuid: `55555555-5555-4555-8555-55555555555${resultBatches.size}`,
          status: "DRAFT",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        resultBatches.set(row.uuid, row);
        return row;
      }
    },
    academicRecord: {
      createMany: async ({ data }) => {
        academicRecords.push(...data);
        return { count: data.length };
      }
    },
    $transaction: async (callback) => callback(prisma)
  };

  const service = new IngestionService(
    prisma,
    {
      assertInstitutionCan: async (institutionRef, _permission, auth) => {
        assert.equal(institutionRef, institution.institutionId);
        return {
          institutionUuid: institution.uuid,
          institutionId: institution.institutionId,
          authorityGrantId: "grant-1"
        };
      },
      assertActorCanOperateInstitution: async (auth, institutionId) => {
        assert.equal(institutionId, institution.uuid);
        if (auth.kind === "API_KEY") throw new ForbiddenException("API key is not assigned to this institution.");
      },
      assertActorAssignedScope: async () => true,
      institutionWhereForActor: async () => ({ institutionId: { in: [institution.uuid] } })
    },
    {
      write: async (event) => auditEvents.push(event)
    }
  );

  const auth = {
    sub: "99999999-9999-4999-8999-999999999999",
    email: "registrar@example.edu.ng",
    fullName: "Registrar",
    role: UserRole.REGISTRAR,
    institutionUuid: institution.uuid,
    institutionId: institution.institutionId,
    institutionUserId: "membership-1",
    permissions: ["academic_setup:write", "academic_setup:read"],
    iat: 1,
    exp: 2
  };

  return { academicRecords, auditEvents, auth, gradingRuleSets, institution, resultBatches, service, sessions, structures };
}

test("registrar creates and lists academic sessions", async () => {
  const { auditEvents, auth, institution, service } = createHarness();

  const created = await service.createAcademicSession(auth, {
    institutionId: institution.institutionId,
    sessionLabel: "2026/2027",
    periodType: "TERM",
    periodLabel: "First Term",
    status: "ACTIVE",
    isCurrent: true
  });

  assert.equal(created.accepted, true);
  assert.equal(created.session.institutionId, institution.uuid);
  assert.equal(created.session.isCurrent, true);

  const sessions = await service.listAcademicSessions(auth, institution.institutionId);
  assert.equal(sessions.length, 1);
  assert.equal(auditEvents.some((event) => event.action === "academic_session.create"), true);
});

test("registrar creates structure nodes with same-institution parent enforcement", async () => {
  const { auth, institution, service } = createHarness();

  const level = await service.createAcademicStructure(auth, {
    institutionId: institution.institutionId,
    type: "LEVEL",
    name: "SS1"
  });

  const subject = await service.createAcademicStructure(auth, {
    institutionId: institution.institutionId,
    parentId: level.structure.uuid,
    type: "SUBJECT",
    name: "Physics",
    code: "PHY"
  });

  assert.equal(subject.accepted, true);
  assert.equal(subject.structure.parentId, level.structure.uuid);
  assert.equal(subject.structure.code, "PHY");
});

test("machine API key cannot perform academic setup human actions", async () => {
  const { institution, service } = createHarness();

  await assert.rejects(
    () =>
      service.createAcademicSession(
        {
          sub: "api-key",
          email: "api-key@acadid.local",
          fullName: "Product Key",
          role: UserRole.REGISTRAR,
          kind: "API_KEY",
          institutionUuid: institution.uuid,
          institutionId: institution.institutionId,
          scopes: ["academic_setup:write"],
          iat: 1,
          exp: 2
        },
        {
          institutionId: institution.institutionId,
          sessionLabel: "2026/2027",
          periodType: "TERM",
          periodLabel: "First Term"
        }
      ),
    ForbiddenException
  );
});

test("registrar configures grading rules and result ingestion computes GPA", async () => {
  const { academicRecords, auditEvents, auth, institution, resultBatches, service } = createHarness();

  const createdRule = await service.createGradingRuleSet(auth, {
    institutionId: institution.institutionId,
    name: "University five point scale",
    engine: "TERTIARY_GPA",
    status: "ACTIVE",
    maxScore: 100,
    gradePointMax: 5,
    passMark: 40,
    scale: [
      { minScore: 70, maxScore: 100, grade: "A", gradePoint: 5, pass: true },
      { minScore: 60, maxScore: 69.99, grade: "B", gradePoint: 4, pass: true },
      { minScore: 50, maxScore: 59.99, grade: "C", gradePoint: 3, pass: true },
      { minScore: 0, maxScore: 49.99, grade: "F", gradePoint: 0, pass: false }
    ]
  });

  assert.equal(createdRule.accepted, true);

  const result = await service.ingestResults(auth, {
    institutionId: institution.institutionId,
    createdById: auth.sub,
    title: "First semester engineering results",
    uploadMode: "COURSE_BASED",
    gradingRuleSetId: createdRule.ruleSet.uuid,
    rows: [
      {
        studentNumber: "STU-001",
        periodType: "SEMESTER",
        periodLabel: "First Semester",
        subjectCode: "MTH101",
        subjectName: "Calculus I",
        totalScore: 73,
        grade: "C",
        creditUnits: 3
      },
      {
        studentNumber: "STU-002",
        periodType: "SEMESTER",
        periodLabel: "First Semester",
        subjectCode: "PHY101",
        subjectName: "General Physics",
        totalScore: 62,
        creditUnits: 2
      }
    ]
  });

  assert.equal(result.accepted, true);
  assert.equal(result.gradingRuleSetId, createdRule.ruleSet.uuid);
  assert.equal(result.gradingSummary.gpa, 4.6);
  assert.equal(academicRecords[0].grade, "A");
  assert.equal(academicRecords[0].gradePoint, 5);
  assert.equal(academicRecords[0].qualityPoints, 15);
  assert.equal(resultBatches.get(result.batchId).validationSummary.warnings[0].code, "UPLOADED_GRADE_OVERRIDDEN");
  assert.equal(auditEvents.some((event) => event.action === "grading_rule_set.create"), true);
});

test("result ingestion falls back to MVP grading scale when no active rule exists", async () => {
  const { auth, institution, service } = createHarness();

  const result = await service.ingestResults(auth, {
    institutionId: institution.institutionId,
    createdById: auth.sub,
    title: "Primary school master sheet",
    uploadMode: "MASTER_SHEET",
    rows: [
      {
        studentNumber: "STU-001",
        periodType: "TERM",
        periodLabel: "First Term",
        subjectCode: "ENG",
        subjectName: "English Language",
        totalScore: 68
      }
    ]
  });

  assert.equal(result.accepted, true);
  assert.equal(result.gradingSummary.source, "DEFAULT_FALLBACK");
  assert.equal(result.gradingSummary.engine, "PRIMARY_SECONDARY");
});
