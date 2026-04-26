import { z } from "zod";
import { AIN_PATTERN } from "./identifiers.js";

export const ainSchema = z.string().regex(AIN_PATTERN);

export const createInstitutionSchema = z.object({
  officialName: z.string().min(2),
  type: z.enum(["PRIMARY", "SECONDARY", "TERTIARY", "EXAM_BODY"]),
  state: z.string().min(2),
  tier: z.enum(["FOUNDING", "ACTIVE", "VERIFIED"]).default("FOUNDING")
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
  createdById: z.string().uuid(),
  title: z.string().min(2),
  rows: z.array(resultRowSchema).min(1).max(1000)
});

export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;
export type CreateAuthorityGrantInput = z.infer<typeof createAuthorityGrantSchema>;
export type StudentRegisterRow = z.infer<typeof studentRegisterRowSchema>;
export type ResultRow = z.infer<typeof resultRowSchema>;
export type IngestStudentRegisterInput = z.infer<typeof ingestStudentRegisterSchema>;
export type IngestResultBatchInput = z.infer<typeof ingestResultBatchSchema>;
