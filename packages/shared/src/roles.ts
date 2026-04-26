export const platformRoles = ["ACADID_SUPER_ADMIN"] as const;

export const institutionRoles = [
  "REGISTRAR",
  "EXAM_OFFICER",
  "DATA_ENTRY_OFFICER"
] as const;

export const learnerRoles = ["STUDENT", "GUARDIAN"] as const;

export const verifierRoles = ["VERIFIER"] as const;

export type PlatformRole = (typeof platformRoles)[number];
export type InstitutionRole = (typeof institutionRoles)[number];
export type LearnerRole = (typeof learnerRoles)[number];
export type VerifierRole = (typeof verifierRoles)[number];

export type AcadidRole = PlatformRole | InstitutionRole | LearnerRole | VerifierRole;
