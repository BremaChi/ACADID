import { z } from "zod";
import { AIN_PATTERN } from "./identifiers.js";

export const ainSchema = z.string().regex(AIN_PATTERN);

export const createInstitutionSchema = z.object({
  officialName: z.string().min(2),
  type: z.enum(["PRIMARY", "SECONDARY", "TERTIARY", "EXAM_BODY"]),
  state: z.string().min(2),
  tier: z.enum(["FOUNDING", "ACTIVE", "VERIFIED"]).default("FOUNDING")
});

export const supportedInstitutionApplicationTypes = [
  "NURSERY",
  "PRIMARY",
  "SECONDARY_JSS",
  "SECONDARY_SSS",
  "COMBINED_SCHOOL",
  "POLYTECHNIC",
  "COLLEGE_OF_EDUCATION",
  "UNIVERSITY",
  "EXAM_BODY"
] as const;

export const createInstitutionApplicationSchema = z.object({
  officialName: z.string().min(2).max(180),
  type: z.enum(supportedInstitutionApplicationTypes),
  state: z.string().min(2).max(80),
  address: z.string().min(5).max(300),
  contactPersonName: z.string().min(2).max(120),
  contactEmail: z.string().email().max(254),
  studentVolume: z.number().int().positive().max(10_000_000),
  documentUploads: z
    .array(
      z.object({
        label: z.string().min(2).max(80),
        storageUrl: z.string().min(3).max(500),
        checksum: z.string().max(160).optional()
      })
    )
    .max(20)
    .default([]),
  mouAccepted: z.literal(true)
});

export const developerAccessRequestScopes = ["ingest:write", "govern:write", "verify:read", "webhook:manage"] as const;

export const createDeveloperAccessRequestSchema = z.object({
  institutionId: z.string().uuid(),
  developerName: z.string().min(2).max(120),
  developerEmail: z.string().email().max(254),
  developerPhone: z.string().min(5).max(40).optional(),
  reason: z.string().min(10).max(1000),
  requestedScopes: z.array(z.enum(developerAccessRequestScopes)).min(1).max(developerAccessRequestScopes.length)
});

export const reviewDeveloperAccessRequestSchema = z.object({
  feedback: z.string().max(1000).optional()
});

export const disputeStatuses = ["OPEN", "RESOLVED", "ESCALATED"] as const;
export const disputePriorities = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;

export const createDisputeSchema = z.object({
  title: z.string().min(3).max(180),
  description: z.string().min(10).max(3000),
  category: z.string().min(2).max(80).default("GENERAL"),
  priority: z.enum(disputePriorities).default("NORMAL"),
  institutionId: z.string().uuid().optional(),
  learnerId: z.string().uuid().optional(),
  credentialId: z.string().uuid().optional(),
  reporterName: z.string().min(2).max(120).optional(),
  reporterEmail: z.string().email().max(254).optional()
});

export const assignDisputeSchema = z.object({
  assignedToId: z.string().uuid().optional(),
  assigneeName: z.string().min(2).max(120).optional()
});

export const sendDisputeNoticeSchema = z.object({
  message: z.string().min(10).max(2000)
});

export const closeDisputeSchema = z.object({
  resolutionNote: z.string().min(10).max(2000)
});

export const escalateDisputeSchema = z.object({
  reason: z.string().min(10).max(1000).optional()
});

export const createAuthorityGrantSchema = z.object({
  institutionId: z.string().uuid(),
  signedByName: z.string().min(2),
  signedByTitle: z.string().min(2),
  effectiveFrom: z.string().date(),
  expiresAt: z.string().date().optional(),
  permissions: z.record(z.unknown())
});

export const studentRegisterRowSchema = z.object({
  fullName: z.string().min(2),
  dateOfBirth: z.string().date(),
  studentNumber: z.string().min(1),
  level: z.string().min(1),
  programme: z.string().min(1),
  phone: z.string().optional()
});

export const ingestStudentRegisterSchema = z.object({
  institutionId: z.string().min(1),
  entryDate: z.string().date().optional(),
  rows: z.array(studentRegisterRowSchema).min(1).max(500)
});

export const resultRowSchema = z.object({
  studentNumber: z.string().min(1),
  periodType: z.enum(["TERM", "SEMESTER"]),
  periodLabel: z.string().min(1),
  subjectCode: z.string().min(1),
  subjectName: z.string().min(1),
  caScore: z.number().min(0).optional(),
  examScore: z.number().min(0).optional(),
  totalScore: z.number().min(0),
  grade: z.string().min(1)
});

export const ingestResultBatchSchema = z.object({
  institutionId: z.string().min(1),
  createdById: z.string().uuid().optional(),
  title: z.string().min(2),
  rows: z.array(resultRowSchema).min(1).max(1000)
});

export const createAccessGrantSchema = z.object({
  credentialRef: z.string().min(1),
  scope: z.enum(["FULL", "GPA", "SEMESTER", "SUBJECT"]).default("FULL"),
  recipientLabel: z.string().min(2),
  expiresAt: z.string().datetime().optional(),
  maxViews: z.number().int().positive().max(100).optional()
});

export const revokeAccessGrantSchema = z.object({
  accessGrantId: z.string().uuid()
});

export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;
export type CreateInstitutionApplicationInput = z.infer<typeof createInstitutionApplicationSchema>;
export type CreateDeveloperAccessRequestInput = z.infer<typeof createDeveloperAccessRequestSchema>;
export type ReviewDeveloperAccessRequestInput = z.infer<typeof reviewDeveloperAccessRequestSchema>;
export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;
export type AssignDisputeInput = z.infer<typeof assignDisputeSchema>;
export type SendDisputeNoticeInput = z.infer<typeof sendDisputeNoticeSchema>;
export type CloseDisputeInput = z.infer<typeof closeDisputeSchema>;
export type EscalateDisputeInput = z.infer<typeof escalateDisputeSchema>;
export type CreateAuthorityGrantInput = z.infer<typeof createAuthorityGrantSchema>;
export type StudentRegisterRow = z.infer<typeof studentRegisterRowSchema>;
export type ResultRow = z.infer<typeof resultRowSchema>;
export type IngestStudentRegisterInput = z.infer<typeof ingestStudentRegisterSchema>;
export type IngestResultBatchInput = z.infer<typeof ingestResultBatchSchema>;
export type CreateAccessGrantInput = z.infer<typeof createAccessGrantSchema>;
export type RevokeAccessGrantInput = z.infer<typeof revokeAccessGrantSchema>;
