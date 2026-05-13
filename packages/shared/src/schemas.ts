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

export const portalUploadPurposes = ["REGISTRATION_CERTIFICATE", "ACCREDITATION_LETTER", "SIGNED_MOU", "OTHER_SUPPORTING_DOCUMENT"] as const;

export const createPortalUploadUrlSchema = z.object({
  fileName: z.string().min(3).max(180),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive().max(15 * 1024 * 1024),
  checksum: z.string().min(8).max(160).optional(),
  purpose: z.enum(portalUploadPurposes)
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
  grade: z.string().min(1).optional(),
  creditUnits: z.number().min(0).max(60).optional()
});

export const academicSessionStatuses = ["DRAFT", "ACTIVE", "CLOSED", "SEALED"] as const;
export const academicStructureTypes = [
  "LEVEL",
  "CLASS",
  "ARM",
  "STREAM",
  "SUBJECT",
  "FACULTY",
  "DEPARTMENT",
  "PROGRAMME",
  "COURSE"
] as const;
export const academicStructureStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const gradingRuleEngines = ["PRIMARY_SECONDARY", "TERTIARY_GPA"] as const;
export const gradingRuleStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

export const gradingScaleBandSchema = z
  .object({
    minScore: z.number().min(0),
    maxScore: z.number().min(0).optional(),
    grade: z.string().min(1).max(20),
    remark: z.string().min(1).max(120).optional(),
    gradePoint: z.number().min(0).max(20).optional(),
    pass: z.boolean().optional()
  })
  .refine((value) => value.maxScore === undefined || value.minScore <= value.maxScore, {
    message: "maxScore must be greater than or equal to minScore.",
    path: ["maxScore"]
  });

export const createGradingRuleSetSchema = z
  .object({
    institutionId: z.string().min(1),
    name: z.string().min(2).max(160),
    engine: z.enum(gradingRuleEngines),
    status: z.enum(gradingRuleStatuses).default("ACTIVE"),
    scale: z.array(gradingScaleBandSchema).min(1).max(30),
    passMark: z.number().min(0).optional(),
    maxScore: z.number().positive().max(1000).default(100),
    gradePointMax: z.number().positive().max(20).optional(),
    effectiveFrom: z.string().date().optional(),
    effectiveTo: z.string().date().optional()
  })
  .refine(
    (value) => value.effectiveFrom === undefined || value.effectiveTo === undefined || value.effectiveFrom <= value.effectiveTo,
    {
      message: "effectiveFrom must be before or equal to effectiveTo.",
      path: ["effectiveTo"]
    }
  );

export const updateGradingRuleSetSchema = z
  .object({
    name: z.string().min(2).max(160).optional(),
    engine: z.enum(gradingRuleEngines).optional(),
    status: z.enum(gradingRuleStatuses).optional(),
    scale: z.array(gradingScaleBandSchema).min(1).max(30).optional(),
    passMark: z.number().min(0).nullable().optional(),
    maxScore: z.number().positive().max(1000).optional(),
    gradePointMax: z.number().positive().max(20).nullable().optional(),
    effectiveFrom: z.string().date().nullable().optional(),
    effectiveTo: z.string().date().nullable().optional()
  })
  .refine(
    (value) =>
      value.effectiveFrom === undefined ||
      value.effectiveFrom === null ||
      value.effectiveTo === undefined ||
      value.effectiveTo === null ||
      value.effectiveFrom <= value.effectiveTo,
    {
      message: "effectiveFrom must be before or equal to effectiveTo.",
      path: ["effectiveTo"]
    }
  );

export const createAcademicSessionSchema = z
  .object({
    institutionId: z.string().min(1),
    sessionLabel: z.string().min(3).max(40),
    periodType: z.enum(["TERM", "SEMESTER"]),
    periodLabel: z.string().min(3).max(80),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    status: z.enum(academicSessionStatuses).default("DRAFT"),
    isCurrent: z.boolean().default(false)
  })
  .refine(
    (value) => value.startDate === undefined || value.endDate === undefined || value.startDate <= value.endDate,
    {
      message: "startDate must be before or equal to endDate.",
      path: ["endDate"]
    }
  );

export const updateAcademicSessionSchema = z
  .object({
    sessionLabel: z.string().min(3).max(40).optional(),
    periodType: z.enum(["TERM", "SEMESTER"]).optional(),
    periodLabel: z.string().min(3).max(80).optional(),
    startDate: z.string().date().nullable().optional(),
    endDate: z.string().date().nullable().optional(),
    status: z.enum(academicSessionStatuses).optional(),
    isCurrent: z.boolean().optional()
  })
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.startDate === null ||
      value.endDate === undefined ||
      value.endDate === null ||
      value.startDate <= value.endDate,
    {
      message: "startDate must be before or equal to endDate.",
      path: ["endDate"]
    }
  );

export const createAcademicStructureSchema = z.object({
  institutionId: z.string().min(1),
  parentId: z.string().uuid().optional(),
  type: z.enum(academicStructureTypes),
  name: z.string().min(1).max(160),
  code: z.string().min(1).max(80).optional(),
  creditUnits: z.number().int().min(0).max(60).optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.enum(academicStructureStatuses).default("ACTIVE")
});

export const updateAcademicStructureSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  type: z.enum(academicStructureTypes).optional(),
  name: z.string().min(1).max(160).optional(),
  code: z.string().min(1).max(80).nullable().optional(),
  creditUnits: z.number().int().min(0).max(60).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  status: z.enum(academicStructureStatuses).optional()
});

export const ingestResultBatchSchema = z.object({
  institutionId: z.string().min(1),
  createdById: z.string().uuid().optional(),
  title: z.string().min(2),
  academicSessionId: z.string().uuid().optional(),
  structureScopeId: z.string().uuid().optional(),
  gradingRuleSetId: z.string().uuid().optional(),
  uploadMode: z.enum(["SUBJECT_BY_SUBJECT", "MASTER_SHEET", "COURSE_BASED", "MANUAL_ENTRY"]).default("MASTER_SHEET"),
  batchLabel: z.string().min(2).max(160).optional(),
  rows: z.array(resultRowSchema).min(1).max(1000)
});

export const rolloverDecisions = ["PROMOTED", "REPEATED", "TRANSFERRED_OUT", "WITHDRAWN", "GRADUATED", "SUSPENDED", "SEALED"] as const;

export const previewRolloverSchema = z.object({
  institutionId: z.string().min(1),
  fromSessionId: z.string().uuid(),
  toSessionId: z.string().uuid().optional(),
  fromStructureId: z.string().uuid().optional(),
  toStructureId: z.string().uuid().optional(),
  decision: z.enum(rolloverDecisions).default("PROMOTED"),
  enrolmentIds: z.array(z.string().uuid()).max(500).optional(),
  limit: z.number().int().min(1).max(500).default(200)
});

export const confirmRolloverDecisionSchema = z.object({
  enrolmentId: z.string().uuid(),
  decision: z.enum(rolloverDecisions),
  toSessionId: z.string().uuid().optional(),
  toStructureId: z.string().uuid().optional(),
  reason: z.string().max(1000).optional()
});

export const confirmRolloverSchema = z.object({
  institutionId: z.string().min(1),
  fromSessionId: z.string().uuid(),
  toSessionId: z.string().uuid().optional(),
  fromStructureId: z.string().uuid().optional(),
  toStructureId: z.string().uuid().optional(),
  decisions: z.array(confirmRolloverDecisionSchema).min(1).max(500)
});

export const transferRequestStatuses = ["REQUESTED", "IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED", "DISPUTED"] as const;

export const createTransferRequestSchema = z
  .object({
    institutionId: z.string().min(1),
    enrolmentId: z.string().uuid(),
    toInstitutionId: z.string().uuid().optional(),
    toInstitutionNameSubmitted: z.string().min(2).max(180).optional(),
    toInstitutionContactEmail: z.string().email().max(254).optional(),
    reason: z.string().min(10).max(2000).optional()
  })
  .refine((value) => Boolean(value.toInstitutionId || value.toInstitutionNameSubmitted), {
    message: "Provide either a target institution id or submitted target institution name.",
    path: ["toInstitutionId"]
  });

export const reviewTransferRequestSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "CANCEL"]),
  note: z.string().max(2000).optional()
});

export const createRolloverDisputeSchema = z.object({
  title: z.string().min(3).max(180).optional(),
  reason: z.string().min(10).max(2000),
  priority: z.enum(disputePriorities).default("NORMAL"),
  reporterName: z.string().min(2).max(120).optional(),
  reporterEmail: z.string().email().max(254).optional()
});

export const resolveRolloverDisputeSchema = z.object({
  resolutionNote: z.string().min(10).max(2000)
});

export const requestSealedSessionReopenSchema = z.object({
  reason: z.string().min(10).max(2000),
  requestedStatus: z.enum(["ACTIVE", "CLOSED"]).default("ACTIVE")
});

export const reviewSealedSessionReopenSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().min(10).max(2000),
  newStatus: z.enum(["ACTIVE", "CLOSED"]).default("ACTIVE")
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

export const recordRequestStatuses = [
  "SUBMITTED",
  "AWAITING_PAYMENT",
  "ASSIGNED",
  "INSTITUTION_REVIEW",
  "NEEDS_MORE_INFORMATION",
  "APPROVED",
  "REJECTED",
  "FULFILLED",
  "DISPUTED",
  "ESCALATED",
  "CANCELLED"
] as const;

export const recordRequestPaymentStatuses = ["NOT_REQUIRED", "PENDING", "PAID", "WAIVED", "REFUNDED"] as const;
export const recordRequestEscrowStatuses = ["NONE", "HELD", "RELEASED", "REFUND_PENDING", "REFUNDED"] as const;

export const invitationLeadStatuses = ["NEW", "CONTACTED", "INVITED", "CONVERTED", "DISMISSED"] as const;

export const createRecordRequestSchema = z
  .object({
    learnerId: z.string().uuid().optional(),
    institutionId: z.string().uuid().optional(),
    institutionNameSubmitted: z.string().min(2).max(180),
    educationLevel: z.string().min(2).max(80),
    yearsAttendedFrom: z.number().int().min(1900).max(2100).optional(),
    yearsAttendedTo: z.number().int().min(1900).max(2100).optional(),
    studentNumber: z.string().min(1).max(80).optional(),
    departmentOrClass: z.string().min(1).max(120).optional(),
    recordTypesRequested: z.array(z.string().min(2).max(80)).min(1).max(12),
    proofDocumentUrls: z.array(z.string().min(3).max(500)).max(20).default([]),
    requesterName: z.string().min(2).max(120).optional(),
    requesterEmail: z.string().email().max(254).optional()
  })
  .refine(
    (value) =>
      value.yearsAttendedFrom === undefined ||
      value.yearsAttendedTo === undefined ||
      value.yearsAttendedFrom <= value.yearsAttendedTo,
    {
      message: "yearsAttendedFrom must be before or equal to yearsAttendedTo.",
      path: ["yearsAttendedTo"]
    }
  );

export const reviewRecordRequestSchema = z.object({
  status: z.enum(recordRequestStatuses),
  note: z.string().max(2000).optional(),
  assignedToId: z.string().uuid().optional(),
  rejectionReason: z.string().max(1000).optional(),
  escalationReason: z.string().max(1000).optional(),
  resolutionNote: z.string().max(2000).optional()
});

export const confirmRecordRequestPaymentSchema = z.object({
  paymentReference: z.string().min(3).max(160),
  amountMinor: z.number().int().positive().max(100_000_000).optional(),
  currency: z.string().length(3).default("NGN"),
  paymentProvider: z.string().min(2).max(60).default("PAYSTACK"),
  paidAt: z.string().datetime().optional(),
  note: z.string().max(1000).optional()
});

export const fulfillRecordRequestSchema = z.object({
  credentialType: z.enum(["TRANSCRIPT", "RESULT_SLIP", "CERTIFICATE"]).default("TRANSCRIPT"),
  note: z.string().max(2000).optional(),
  releasePayment: z.boolean().default(true)
});

export const updateInvitationLeadSchema = z
  .object({
    status: z.enum(invitationLeadStatuses).optional(),
    note: z.string().max(2000).optional(),
    sourceApplicationId: z.string().uuid().optional(),
    convertedInstitutionId: z.string().uuid().optional()
  })
  .refine(
    (value) => Boolean(value.status || value.note || value.sourceApplicationId || value.convertedInstitutionId),
    "At least one invitation lead update field is required."
  );

export const platformSettingsSchema = z.object({
  approval: z.object({
    requireMou: z.boolean(),
    requireDocumentUpload: z.boolean(),
    allowAutoApprove: z.boolean(),
    maxApplicationReviewDays: z.number().int().min(1).max(90)
  }),
  api: z.object({
    defaultEnvironment: z.enum(["SANDBOX", "PRODUCTION"]),
    defaultRateLimitPerMinute: z.number().int().min(10).max(100_000),
    productKeyRotationDays: z.number().int().min(1).max(730),
    institutionKeyRotationDays: z.number().int().min(1).max(730)
  }),
  rateLimits: z.object({
    emergency: z.object({
      enabled: z.boolean(),
      limitPerMinute: z.number().int().min(1).max(100_000),
      reason: z.string().max(500).nullable().optional()
    }),
    productDefaultsPerMinute: z.record(z.string().min(1).max(80), z.number().int().min(1).max(100_000)),
    institutionDefaultsPerMinute: z.object({
      sandbox: z.number().int().min(1).max(100_000),
      production: z.number().int().min(1).max(100_000)
    }),
    institutionOverridesPerMinute: z.record(z.string().min(1).max(120), z.number().int().min(1).max(100_000)),
    scopeOverrides: z.record(
      z.string().min(1).max(120),
      z.object({
        limit: z.number().int().min(1).max(100_000),
        windowSeconds: z.number().int().min(1).max(3600)
      })
    )
  }).optional(),
  notifications: z.object({
    founderEmail: z.string().email().max(254),
    notifyOnNewApplication: z.boolean(),
    notifyOnDeveloperRequest: z.boolean(),
    notifyOnDispute: z.boolean(),
    weeklySummaryEnabled: z.boolean()
  }),
  emailTemplates: z.object({
    applicationApprovedSubject: z.string().min(4).max(160),
    applicationRejectedSubject: z.string().min(4).max(160),
    developerAccessApprovedSubject: z.string().min(4).max(160),
    disputeNoticeSubject: z.string().min(4).max(160)
  })
});

export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;
export type CreateInstitutionApplicationInput = z.infer<typeof createInstitutionApplicationSchema>;
export type CreatePortalUploadUrlInput = z.infer<typeof createPortalUploadUrlSchema>;
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
export type GradingScaleBand = z.infer<typeof gradingScaleBandSchema>;
export type CreateGradingRuleSetInput = z.infer<typeof createGradingRuleSetSchema>;
export type UpdateGradingRuleSetInput = z.infer<typeof updateGradingRuleSetSchema>;
export type IngestStudentRegisterInput = z.infer<typeof ingestStudentRegisterSchema>;
export type IngestResultBatchInput = z.infer<typeof ingestResultBatchSchema>;
export type PreviewRolloverInput = z.infer<typeof previewRolloverSchema>;
export type ConfirmRolloverInput = z.infer<typeof confirmRolloverSchema>;
export type CreateTransferRequestInput = z.infer<typeof createTransferRequestSchema>;
export type ReviewTransferRequestInput = z.infer<typeof reviewTransferRequestSchema>;
export type CreateRolloverDisputeInput = z.infer<typeof createRolloverDisputeSchema>;
export type ResolveRolloverDisputeInput = z.infer<typeof resolveRolloverDisputeSchema>;
export type RequestSealedSessionReopenInput = z.infer<typeof requestSealedSessionReopenSchema>;
export type ReviewSealedSessionReopenInput = z.infer<typeof reviewSealedSessionReopenSchema>;
export type CreateAcademicSessionInput = z.infer<typeof createAcademicSessionSchema>;
export type UpdateAcademicSessionInput = z.infer<typeof updateAcademicSessionSchema>;
export type CreateAcademicStructureInput = z.infer<typeof createAcademicStructureSchema>;
export type UpdateAcademicStructureInput = z.infer<typeof updateAcademicStructureSchema>;
export type CreateAccessGrantInput = z.infer<typeof createAccessGrantSchema>;
export type RevokeAccessGrantInput = z.infer<typeof revokeAccessGrantSchema>;
export type CreateRecordRequestInput = z.infer<typeof createRecordRequestSchema>;
export type ReviewRecordRequestInput = z.infer<typeof reviewRecordRequestSchema>;
export type ConfirmRecordRequestPaymentInput = z.infer<typeof confirmRecordRequestPaymentSchema>;
export type FulfillRecordRequestInput = z.infer<typeof fulfillRecordRequestSchema>;
export type UpdateInvitationLeadInput = z.infer<typeof updateInvitationLeadSchema>;
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;
