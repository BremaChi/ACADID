export const learnerIdentityStatuses = ["VERIFIED", "UNVERIFIED", "PENDING_REVIEW"] as const;
export const institutionStatuses = ["ACTIVE", "SUSPENDED"] as const;
export const developerAccessRequestStatuses = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;
export const authorityGrantStatuses = ["ACTIVE", "SUSPENDED", "TERMINATED"] as const;
export const enrolmentStatuses = ["ACTIVE", "CLOSED"] as const;
export const academicRecordStatuses = [
  "DRAFT",
  "SUBMITTED",
  "REVIEWED",
  "APPROVED",
  "PUBLISHED",
  "AMENDED"
] as const;
export const credentialStatuses = ["ACTIVE", "SUSPENDED", "REVOKED", "SUPERSEDED", "EXPIRED"] as const;
export const accessGrantScopes = ["FULL", "GPA", "SEMESTER", "SUBJECT"] as const;
export const verificationOutcomes = ["CONFIRMED", "DENIED", "DISCREPANCY", "REVOKED"] as const;

export type LearnerIdentityStatus = (typeof learnerIdentityStatuses)[number];
export type InstitutionStatus = (typeof institutionStatuses)[number];
export type DeveloperAccessRequestStatus = (typeof developerAccessRequestStatuses)[number];
export type AuthorityGrantStatus = (typeof authorityGrantStatuses)[number];
export type EnrolmentStatus = (typeof enrolmentStatuses)[number];
export type AcademicRecordStatus = (typeof academicRecordStatuses)[number];
export type CredentialStatus = (typeof credentialStatuses)[number];
export type AccessGrantScope = (typeof accessGrantScopes)[number];
export type VerificationOutcome = (typeof verificationOutcomes)[number];
