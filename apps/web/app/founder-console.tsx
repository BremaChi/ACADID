"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_ACADID_API_URL ?? "http://localhost:4000/api";

const navItems = [
  "Overview",
  "Institutions",
  "Academic Operations",
  "Institution Applications",
  "API Keys",
  "Developer Access Requests",
  "Webhooks",
  "Record Requests",
  "Disputes",
  "Verification Logs",
  "Background Jobs",
  "Revenue",
  "Billing",
  "Reports",
  "System Health",
  "Audit Logs",
  "Security",
  "Settings"
] as const;

type PageKey = (typeof navItems)[number];
type WorkspaceTab = { label: string; count?: number; tone?: "success" | "warning" | "error" | "accent" };

const navGroups: { label: string; items: PageKey[] }[] = [
  { label: "Main", items: ["Overview", "Institutions", "Academic Operations", "Institution Applications"] },
  { label: "Access & Integrations", items: ["API Keys", "Developer Access Requests", "Webhooks"] },
  { label: "Operations", items: ["Record Requests", "Disputes", "Verification Logs", "Background Jobs"] },
  { label: "Business", items: ["Revenue", "Billing", "Reports"] },
  { label: "System", items: ["System Health", "Audit Logs", "Security", "Settings"] }
];

const scopeOptions = ["institution:apply", "ingest:write", "govern:write", "access:read", "verify:read", "identity:write", "webhook:manage"];
const staffRoleOptions = ["REGISTRAR", "EXAM_OFFICER", "DATA_ENTRY_OFFICER", "DEPARTMENTAL_OFFICER", "READ_ONLY"];
const staffPermissionDefaults: Record<string, string[]> = {
  REGISTRAR: ["staff:manage", "academic_setup:read", "academic_setup:write", "ingest:write", "govern:write", "govern:publish", "records:amend"],
  EXAM_OFFICER: ["academic_setup:read", "students:read", "results:read", "govern:review", "record_requests:verify"],
  DATA_ENTRY_OFFICER: ["students:write", "ingest:write", "results:draft", "govern:submit", "record_requests:upload"],
  DEPARTMENTAL_OFFICER: ["academic_setup:read", "students:read", "results:read", "ingest:write", "govern:review", "record_requests:verify"],
  READ_ONLY: ["academic_setup:read", "students:read", "results:read", "credentials:read", "reports:read"]
};
const productOptions = [
  {
    code: "INSTITUTION_PORTAL",
    name: "Institution Portal",
    description: "For the public institution web portal that receives school applications and MOU acceptance.",
    recommendedScopes: ["institution:apply"],
    rateLimitPerMinute: 1000
  },
  {
    code: "STUDENT_APP",
    name: "Student Mobile App",
    description: "For the learner passport app that reads credentials and manages share access.",
    recommendedScopes: ["access:read", "identity:write"],
    rateLimitPerMinute: 2000
  },
  {
    code: "EMPLOYER_VERIFICATION_PORTAL",
    name: "Employer Verification Portal",
    description: "For verifier web products that validate credential references and share links.",
    recommendedScopes: ["verify:read"],
    rateLimitPerMinute: 1500
  },
  {
    code: "EXAM_BODY_API",
    name: "Exam Body Connector",
    description: "For exam-body integrations that submit result data and verify publication status.",
    recommendedScopes: ["ingest:write", "govern:write", "verify:read"],
    rateLimitPerMinute: 2000
  }
];
const institutionTypeOptions = [
  "Nursery",
  "Primary School",
  "Secondary School",
  "Nursery + Primary",
  "Primary + Secondary",
  "Nursery + Primary + Secondary",
  "Polytechnic",
  "College of Education",
  "State University",
  "Federal University",
  "Private University",
  "Exam Body",
  "Other Accredited Institution"
];
const institutionCategoryOptions = ["PRIMARY", "SECONDARY", "TERTIARY", "EXAM_BODY"];
const institutionCategoryLabels: Record<string, string> = {
  PRIMARY: "Primary / Nursery",
  SECONDARY: "Secondary School",
  TERTIARY: "Tertiary Institution",
  EXAM_BODY: "Exam Body"
};
const nigeriaStateOptions = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Abuja FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara"
];

type Institution = {
  uuid: string;
  institutionId: string;
  officialName: string;
  type: string;
  state: string;
  tier: string;
  status: string;
  mouSignedAt: string | null;
  createdAt: string;
};

type InstitutionStaff = {
  uuid: string;
  role: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  permissions: string[];
  assignedScopes: Array<Record<string, string>>;
  twoFactorRequired: boolean;
  invitedAt: string | null;
  inviteExpiresAt: string | null;
  inviteAcceptedAt: string | null;
  lastLoginAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
  user: {
    uuid: string;
    email: string;
    fullName: string;
    phone: string | null;
    mfaEnabled: boolean;
  };
  invitedBy: {
    uuid: string;
    email: string;
    fullName: string;
  } | null;
  institution: {
    uuid: string;
    institutionId: string;
    officialName: string;
  };
};

type ApiKey = {
  uuid: string;
  ownerType: "PRODUCT" | "INSTITUTION";
  institutionId: string | null;
  productCode: string | null;
  productName: string | null;
  clientId: string;
  label: string;
  scopes: string[];
  environment: "SANDBOX" | "PRODUCTION";
  status: string;
  rateLimitPerMinute: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

type GlobalApiKey = ApiKey & {
  institutionUuid: string | null;
  institutionDisplayId: string | null;
  institutionName: string | null;
  institutionStatus: string | null;
  ownerLabel: string | null;
  ownerReference: string | null;
};

type InstitutionApplication = {
  uuid: string;
  officialName: string;
  type: string;
  state: string;
  address: string;
  contactPersonName: string;
  contactEmail: string;
  studentVolume: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewFeedback: string | null;
  approvedInstitutionId: string | null;
  createdAt: string;
};

type CreatedApiKey = ApiKey & {
  clientSecret: string;
  warning: string;
};

type CreatedRegistrarInvite = {
  institution: Institution;
  registrarInvite: {
    id: string;
    status: string;
    inviteExpiresAt: string;
    user: {
      uuid: string;
      email: string;
      fullName: string;
    };
  };
  inviteToken: string;
  warning: string;
};

type CreatedStaffInvite = {
  invitation: {
    id: string;
    status: string;
    role: string;
    permissions: string[];
    inviteExpiresAt: string;
    user: {
      uuid: string;
      email: string;
      fullName: string;
      phone: string | null;
    };
    institution: {
      uuid: string;
      institutionId: string;
      officialName: string;
    };
  };
  inviteToken: string;
  warning: string;
};

type LoginResponse = {
  accessToken: string;
  user: {
    email: string;
    fullName: string;
    role: string;
    mfaEnabled: boolean;
  };
};

type TotpSetup = {
  secret: string;
  otpauthUrl: string;
  mfaEnabled: boolean;
};

type RecoveryCodeStatus = {
  remaining: number;
  generatedAt: string | null;
};

type RecoveryCodeRotation = {
  recoveryCodes: string[];
  warning: string;
};

type Notice = {
  tone: "success" | "warning" | "error";
  text: string;
};

type DeveloperAccessRequest = {
  uuid: string;
  institutionId: string;
  institution: Institution;
  developerName: string;
  developerEmail: string;
  developerPhone: string | null;
  reason: string;
  requestedScopes: string[];
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  reviewFeedback: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type Dispute = {
  uuid: string;
  title: string;
  description: string;
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  status: "OPEN" | "RESOLVED" | "ESCALATED";
  reporterName: string | null;
  reporterEmail: string | null;
  institutionNotice: string | null;
  noticeSentAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  institution: Institution | null;
  learner: { uuid: string; ain: string; fullName: string; identityStatus: string } | null;
  credential: { uuid: string; credentialRef: string; type: string; status: string } | null;
  assignedTo: { uuid: string; fullName: string; email: string } | null;
};

type RecordRequestStatus =
  | "SUBMITTED"
  | "AWAITING_PAYMENT"
  | "ASSIGNED"
  | "INSTITUTION_REVIEW"
  | "NEEDS_MORE_INFORMATION"
  | "APPROVED"
  | "REJECTED"
  | "FULFILLED"
  | "DISPUTED"
  | "ESCALATED"
  | "CANCELLED";

type InvitationLeadStatus = "NEW" | "CONTACTED" | "INVITED" | "CONVERTED" | "DISMISSED";

type RecordRequest = {
  uuid: string;
  requestId: string;
  learnerId: string | null;
  institutionId: string | null;
  institutionNameSubmitted: string;
  educationLevel: string;
  yearsAttendedFrom: number | null;
  yearsAttendedTo: number | null;
  studentNumber: string | null;
  departmentOrClass: string | null;
  recordTypesRequested: string[];
  proofDocumentUrls: string[];
  status: RecordRequestStatus;
  paymentStatus: "NOT_REQUIRED" | "PENDING" | "PAID" | "WAIVED" | "REFUNDED";
  paymentReference: string | null;
  amountMinor: number | null;
  currency: string;
  requesterName: string | null;
  requesterEmail: string | null;
  rejectionReason: string | null;
  escalationReason: string | null;
  resolutionNote: string | null;
  submittedAt: string;
  assignedAt: string | null;
  fulfilledAt: string | null;
  rejectedAt: string | null;
  escalatedAt: string | null;
  createdAt: string;
  learner: { uuid: string; ain: string; fullName: string; identityStatus: string } | null;
  institution: { uuid: string; institutionId: string; officialName: string; state: string; status: string } | null;
  assignedTo: { uuid: string; fullName: string; email: string; role: string } | null;
};

type InvitationLead = {
  uuid: string;
  institutionName: string;
  institutionNameKey: string;
  educationLevel: string | null;
  stateHint: string | null;
  demandCount: number;
  requesterCount: number;
  latestRecordRequestId: string | null;
  latestRecordRequestCode: string | null;
  recordRequestIds: string[];
  status: InvitationLeadStatus;
  lastRequestedAt: string;
  lastContactedAt: string | null;
  invitedAt: string | null;
  dismissedAt: string | null;
  convertedAt: string | null;
  convertedInstitutionId: string | null;
  sourceApplicationId: string | null;
  reviewedById: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type VerificationLog = {
  id: string;
  ain: string;
  learnerName: string;
  institutionId: string;
  institutionName: string;
  institutionState: string;
  verifier: string;
  verifierType: string;
  credential: string;
  credentialType: string;
  credentialStatus: string;
  outcome: string;
  scopeShown: string;
  accessGrantScope: string | null;
  verifiedAt: string;
};

type HealthStatus = "OPERATIONAL" | "DEGRADED" | "DOWN" | "PENDING_CONFIGURATION";

type SystemHealth = {
  overallStatus: HealthStatus;
  generatedAt: string;
  uptimeSeconds: number;
  services: Array<{
    name: string;
    status: HealthStatus;
    responseTimeMs: number;
    message: string;
    metadata?: {
      readyBacklog?: number;
      scheduledBacklog?: number;
      runningJobs?: number;
      failedJobs24h?: number;
      staleRunningJobs?: number;
      activeWorkers?: number;
      staleWorkers?: number;
      stoppedWorkers?: number;
      workerStaleAfterSeconds?: number;
      queues?: Array<{ queue: string; queued: number; retrying: number; running: number; failed: number; total: number }>;
      recentWorkers?: Array<{ jobId: string; queue: string; type: string; status: string; lockedBy: string | null; updatedAt: string }>;
      workerHeartbeats?: Array<{
        workerId: string;
        hostname: string | null;
        processId: number | null;
        queues: string[];
        status: string;
        concurrency: number;
        currentJobId: string | null;
        currentQueue: string | null;
        lastStartedAt: string | null;
        lastSeenAt: string;
        updatedAt: string;
      }>;
      pendingOrRetrying?: number;
      dueNow?: number;
      failed24h?: number;
      delivered24h?: number;
      secretConfigured?: boolean;
      statusBreakdown?: Array<{ status: string; count: number }>;
      totalBuckets?: number;
      recentBuckets?: number;
      staleBuckets?: number;
      totalRequests?: number;
      recentRequests?: number;
      recentHours?: number;
      staleAfterHours?: number;
      topScopes?: Array<{ scope: string; buckets: number; requests: number }>;
      totalRecords?: number;
      recentRecords?: number;
      expiredRecords?: number;
      staleInProgressRecords?: number;
      failedRecords?: number;
      succeededRecords?: number;
      metrics?: {
        localHits?: number;
        localMisses?: number;
        remoteHits?: number;
        remoteMisses?: number;
        totalHits?: number;
        totalMisses?: number;
        hitRate?: number;
        loads?: number;
        sets?: number;
      };
      configured?: boolean;
      provider?: string;
      endpointHost?: string | null;
      lastStatusCode?: number | null;
      lastError?: string | null;
      delivered?: number;
      failed?: number;
      topOperations?: Array<{ operation: string; count: number }>;
      latestRecords?: Array<{
        id: string;
        scope: string;
        keyHashPreview: string;
        operation: string;
        status: string;
        actorType: string | null;
        clientId: string | null;
        jobId: string | null;
        error: string | null;
        expiresAt: string;
        createdAt: string;
        updatedAt: string;
      }>;
      pending?: number;
      sent24h?: number;
      bucket?: string | null;
      downloadBaseConfigured?: boolean;
      supabaseUrlConfigured?: boolean;
      serviceRoleConfigured?: boolean;
      probeConfigured?: boolean;
      probeSucceeded?: boolean | null;
      probeSource?: string | null;
      probeBytes?: number | null;
      probeKeyHash?: string | null;
      maxDownloadBytes?: number;
      providers?: {
        email: { configured: boolean; provider: string };
        sms: { configured: boolean; provider: string };
        push: { configured: boolean; provider: string };
        requireProvider: boolean;
      };
      channelBreakdown?: Array<{ channel: string; status: string; count: number }>;
      recentFailures?: Array<{
        id: string;
        institutionId: string | null;
        institutionName: string | null;
        learnerAin: string | null;
        learnerName: string | null;
        channel: string;
        type: string;
        title: string;
        status: string;
        error: string | null;
        updatedAt: string;
      }>;
    };
  }>;
  metrics: {
    status: HealthStatus;
    responseTimeMs: number;
    gatewayRequestsToday: number;
    verificationEventsToday: number;
    deniedVerificationEvents: number;
    revokedVerificationEvents: number;
    discrepancyEvents: number;
    auditEventsToday: number;
    failedAuditEvents: number;
    publishedCredentialsToday: number;
    readyBackgroundJobs: number;
    failedBackgroundJobs: number;
    pendingWebhooks: number;
    failedWebhooks: number;
    errorRate: number;
    message?: string;
  };
  incidents: Array<{
    title: string;
    severity: string;
    status: string;
    message: string;
    detectedAt: string;
  }>;
};

type DeadLetterOverview = {
  generatedAt: string;
  summary: {
    failedJobs: number;
    failedWebhookDeliveries: number;
    failedNotifications: number;
    oldestFailedAt: string | null;
  };
  jobs: Array<{
    id: string;
    type: string;
    queue: string;
    status: string;
    institutionId: string | null;
    institutionName: string | null;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    attempts: number;
    maxAttempts: number;
    error: string | null;
    failedAt: string | null;
    updatedAt: string;
    linkedWebhookDeliveries: Array<{ uuid: string; status: string; eventType: string; lastError: string | null; updatedAt: string }>;
    linkedNotifications: Array<{ uuid: string; status: string; channel: string; type: string; title: string; error: string | null; updatedAt: string }>;
  }>;
  webhookDeliveries: Array<{
    id: string;
    jobId: string;
    institutionId: string | null;
    institutionName: string | null;
    targetUrl: string;
    eventType: string;
    status: string;
    attempts: number;
    lastStatusCode: number | null;
    lastError: string | null;
    updatedAt: string;
  }>;
  notifications: Array<{
    id: string;
    jobId: string | null;
    institutionId: string | null;
    institutionName: string | null;
    channel: string;
    type: string;
    title: string;
    status: string;
    error: string | null;
    updatedAt: string;
  }>;
};

type WebhookEndpoint = {
  id: string;
  institutionUuid: string;
  institutionId: string;
  institutionName: string;
  label: string;
  targetUrl: string;
  eventTypes: string[];
  status: string;
  secretPreview: string | null;
  createdAt: string;
  rotatedAt: string | null;
  disabledAt: string | null;
};

type WebhookDelivery = {
  id: string;
  jobId: string | null;
  institutionUuid: string | null;
  institutionId: string | null;
  institutionName: string | null;
  webhookEndpointId: string | null;
  targetUrl: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
};

type WebhookSecretResponse = {
  endpoint: WebhookEndpoint;
  secret: string;
  warning: string;
};

type AuditEvent = {
  id: string;
  requestId: string | null;
  actorType: string | null;
  actorUserId: string | null;
  clientId: string | null;
  action: string;
  label: string;
  targetType: string;
  targetId: string | null;
  entityType: string | null;
  entityId: string | null;
  outcome: string;
  reason: string | null;
  actorRole: string | null;
  role: string | null;
  endpoint: string | null;
  httpMethod: string | null;
  hasIpAddressHash: boolean;
  hasUserAgentHash: boolean;
  actorName: string;
  actorEmail: string | null;
  institutionId: string | null;
  institutionName: string | null;
  createdAt: string;
};

type DashboardSummary = {
  generatedAt: string;
  metrics: {
    totalInstitutions: number;
    pendingApplications: number;
    activeLearners: number;
    resultsPublished: number;
    credentialsIssued: number;
    apiCallsToday: number;
    activeApiKeys: number;
    pendingDeveloperRequests: number;
    openDisputes: number;
  };
  institutionStatus: {
    total: number;
    active: number;
    suspended: number;
    pendingApproval: number;
    apiAccessActive: number;
  };
  apiUsage: Array<{
    day: string;
    verification: number;
    audit: number;
    total: number;
  }>;
  latestAuditEvents: AuditEvent[];
};

type AcademicOperations = {
  generatedAt: string;
  metrics: {
    activeSessions: number;
    sealedSessions: number;
    structureNodes: number;
    activeEnrolments: number;
    pendingRollovers: number;
    approvedRollovers: number;
    requestedTransfers?: number;
    disputedTransfers?: number;
    institutionsMissingGradingRules?: number;
    institutionsMissingSubjectsOrCourses?: number;
    institutionsWithUnscopedStaff?: number;
    institutionsWithValidationBacklog?: number;
    slowValidationJobs?: number;
    failedValidationJobs?: number;
    storageObjects?: number;
    publishedBatches: number;
    rejectedBatches: number;
    reopenEscalations: number;
  };
  setupGaps?: {
    missingGradingRules: number;
    missingSubjectsOrCourses: number;
    unscopedStaffInstitutions: number;
    validationBacklogInstitutions: number;
    storageObjects: number;
  };
  sessionStatus: Array<{ status: string; count: number }>;
  batchStatus: Array<{ status: string; count: number }>;
  rolloverStatus: Array<{ status: string; count: number }>;
  transferStatus?: Array<{ status: string; count: number }>;
  structureTypes: Array<{ type: string; count: number }>;
  institutionHealth: Array<{
    institutionUuid: string;
    institutionId: string;
    institutionName: string;
    state: string;
    status: string;
    tier: string;
    activeSessions: number;
    sealedSessions: number;
    structureNodes: number;
    subjectCourseNodes?: number;
    activeGradingRules?: number;
    activeEnrolments: number;
    pendingRollovers: number;
    activeTransfers?: number;
    publishedBatches: number;
    rejectedBatches: number;
    scopedStaff?: number;
    unscopedStaff?: number;
    activeStaff?: number;
    validationJobsAttention?: number;
    slowValidationJobs?: number;
    failedValidationJobs?: number;
    storageObjects?: number;
    storageBreakdown?: {
      importFiles: number;
      mouDocuments: number;
      proofDocuments: number;
      applicationDocuments: number;
      totalObjects: number;
    };
    completionScore: number;
    flags: string[];
  }>;
  sealedSessions: Array<{
    id: string;
    institutionId: string;
    institutionName: string;
    state: string;
    sessionLabel: string;
    periodType: string;
    periodLabel: string;
    isCurrent: boolean;
    updatedAt: string;
  }>;
  recentRollovers: Array<{
    id: string;
    institutionId: string;
    institutionName: string;
    learnerAin: string;
    learnerName: string;
    decision: string;
    status: string;
    fromSession: string;
    toSession: string;
    fromStructure: string;
    toStructure: string;
    createdAt: string;
  }>;
  recentTransfers?: Array<{
    id: string;
    transferId: string;
    status: string;
    learnerAin: string;
    learnerName: string;
    fromInstitutionId: string;
    fromInstitutionName: string;
    toInstitutionId: string | null;
    toInstitutionName: string | null;
    rolloverId: string | null;
    disputeId: string | null;
    createdAt: string;
  }>;
  disputedRollovers?: Array<{
    id: string;
    institutionId: string;
    institutionName: string;
    learnerAin: string;
    learnerName: string;
    decision: string;
    disputeId: string | null;
    disputeTitle: string | null;
    disputeStatus: string | null;
    transferId: string | null;
    disputedAt: string | null;
    resolutionNote: string | null;
  }>;
  sealedSessionEscalations: AuditEvent[];
};

type RevenueOverview = {
  generatedAt: string;
  currency: string;
  totals: {
    totalAmountMinor: number;
    paidThisMonthMinor: number;
    pendingThisMonthMinor: number;
    activeSubscriptions: number;
    openLedgerEntries: number;
  };
  categoryBreakdown: Array<{
    category: "VERIFICATION_FEE" | "CREDENTIAL_EXPORT_FEE" | "INSTITUTION_SUBSCRIPTION";
    amountMinor: number;
    count: number;
  }>;
  statusBreakdown: Array<{
    status: string;
    amountMinor: number;
    count: number;
  }>;
  daily: Array<{
    day: string;
    amountMinor: number;
    count: number;
  }>;
  recentEntries: Array<{
    id: string;
    category: string;
    status: string;
    amountMinor: number;
    currency: string;
    institutionId: string | null;
    institutionName: string | null;
    sourceType: string;
    sourceId: string | null;
    description: string;
    occurredAt: string;
  }>;
  subscriptions: Array<{
    id: string;
    institutionId: string;
    institutionName: string;
    planCode: string;
    status: string;
    amountMinor: number;
    currency: string;
    billingInterval: string;
    currentPeriodEnd: string;
    nextBillingAt: string | null;
  }>;
};

type PlatformSettings = {
  approval: {
    requireMou: boolean;
    requireDocumentUpload: boolean;
    allowAutoApprove: boolean;
    maxApplicationReviewDays: number;
  };
  api: {
    defaultEnvironment: "SANDBOX" | "PRODUCTION";
    defaultRateLimitPerMinute: number;
    productKeyRotationDays: number;
    institutionKeyRotationDays: number;
  };
  rateLimits: RateLimitPolicyControl;
  notifications: {
    founderEmail: string;
    notifyOnNewApplication: boolean;
    notifyOnDeveloperRequest: boolean;
    notifyOnDispute: boolean;
    weeklySummaryEnabled: boolean;
  };
  emailTemplates: {
    applicationApprovedSubject: string;
    applicationRejectedSubject: string;
    developerAccessApprovedSubject: string;
    disputeNoticeSubject: string;
  };
};

type RateLimitPolicyControl = {
  emergency: {
    enabled: boolean;
    limitPerMinute: number;
    reason: string | null;
  };
  productDefaultsPerMinute: Record<string, number>;
  institutionDefaultsPerMinute: {
    sandbox: number;
    production: number;
  };
  institutionOverridesPerMinute: Record<string, number>;
  scopeOverrides: Record<string, { limit: number; windowSeconds: number }>;
};

type RateLimitPolicyResponse = {
  policy: RateLimitPolicyControl;
  metadata: {
    updatedAt: string | null;
    updatedBy: { fullName: string; email: string } | null;
    persisted: boolean;
  };
};

const defaultRateLimitPolicy: RateLimitPolicyControl = {
  emergency: {
    enabled: false,
    limitPerMinute: 60,
    reason: null
  },
  productDefaultsPerMinute: Object.fromEntries(productOptions.map((product) => [product.code, product.rateLimitPerMinute])),
  institutionDefaultsPerMinute: {
    sandbox: 500,
    production: 2000
  },
  institutionOverridesPerMinute: {},
  scopeOverrides: {}
};

type PlatformSettingsResponse = {
  settings: PlatformSettings;
  metadata: {
    updatedAt: string | null;
    updatedBy: { fullName: string; email: string } | null;
    persistedKeys: string[];
  };
};

const defaultPlatformSettings: PlatformSettings = {
  approval: {
    requireMou: true,
    requireDocumentUpload: true,
    allowAutoApprove: false,
    maxApplicationReviewDays: 14
  },
  api: {
    defaultEnvironment: "SANDBOX",
    defaultRateLimitPerMinute: 1000,
    productKeyRotationDays: 180,
    institutionKeyRotationDays: 90
  },
  rateLimits: defaultRateLimitPolicy,
  notifications: {
    founderEmail: "founder@acadid.local",
    notifyOnNewApplication: true,
    notifyOnDeveloperRequest: true,
    notifyOnDispute: true,
    weeklySummaryEnabled: true
  },
  emailTemplates: {
    applicationApprovedSubject: "ACAD.ID institution application approved",
    applicationRejectedSubject: "ACAD.ID institution application update",
    developerAccessApprovedSubject: "ACAD.ID Developer Access approved",
    disputeNoticeSubject: "ACAD.ID credential dispute notice"
  }
};

function getProductOption(code: string) {
  return productOptions.find((option) => option.code === code) ?? productOptions[0];
}

class ApiRequestError extends Error {
  status: number;
  code?: string;
  retryable: boolean;

  constructor(message: string, status: number, code?: string, retryable = false) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

function isSessionExpired(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401;
}

async function apiRequest<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
  const text = await response.text();
  const data = text ? parseApiResponse(text) : {};
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : JSON.stringify(data);
    const code = typeof data.code === "string" ? data.code : undefined;
    const retryable = typeof data.retryable === "boolean" ? data.retryable : false;
    throw new ApiRequestError(message, response.status, code, retryable);
  }
  return data as T;
}

function parseApiResponse(text: string): Record<string, unknown> {
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data as Record<string, unknown> : {};
  } catch {
    return { message: text };
  }
}

function isDatabaseUnavailable(error: unknown) {
  return error instanceof ApiRequestError && (error.code === "DATABASE_UNAVAILABLE" || error.status === 503);
}

async function loadDeveloperAccessRequests(token: string): Promise<DeveloperAccessRequest[]> {
  return apiRequest<DeveloperAccessRequest[]>("/admin/developer-access-requests", token);
}

async function loadDisputes(token: string): Promise<Dispute[]> {
  return apiRequest<Dispute[]>("/admin/disputes", token);
}

async function loadVerificationLogs(token: string): Promise<VerificationLog[]> {
  return apiRequest<VerificationLog[]>("/admin/verification-logs", token);
}

async function loadRecordRequests(token: string): Promise<RecordRequest[]> {
  return apiRequest<RecordRequest[]>("/admin/record-requests", token);
}

async function loadInvitationLeads(token: string): Promise<InvitationLead[]> {
  return apiRequest<InvitationLead[]>("/admin/invitation-leads", token);
}

async function loadSystemHealth(token: string): Promise<SystemHealth> {
  return apiRequest<SystemHealth>("/admin/system-health", token);
}

async function loadRateLimitPolicy(token: string): Promise<RateLimitPolicyResponse> {
  return apiRequest<RateLimitPolicyResponse>("/admin/rate-limits/policy", token);
}

async function loadDeadLetters(token: string): Promise<DeadLetterOverview> {
  return apiRequest<DeadLetterOverview>("/admin/dead-letters", token);
}

async function loadWebhookEndpoints(token: string): Promise<WebhookEndpoint[]> {
  return apiRequest<WebhookEndpoint[]>("/admin/webhook-endpoints", token);
}

async function loadWebhookDeliveries(token: string): Promise<WebhookDelivery[]> {
  return apiRequest<WebhookDelivery[]>("/admin/webhook-deliveries", token);
}

async function loadDashboardSummary(token: string): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>("/admin/dashboard-summary", token);
}

async function loadAcademicOperations(token: string): Promise<AcademicOperations> {
  return apiRequest<AcademicOperations>("/admin/academic-operations", token);
}

async function loadAuditEvents(token: string): Promise<AuditEvent[]> {
  return apiRequest<AuditEvent[]>("/admin/audit-events", token);
}

async function loadRevenueOverview(token: string): Promise<RevenueOverview> {
  return apiRequest<RevenueOverview>("/admin/revenue", token);
}

async function loadPlatformSettings(token: string): Promise<PlatformSettingsResponse> {
  return apiRequest<PlatformSettingsResponse>("/admin/settings", token);
}

async function loadRecoveryCodeStatus(token: string): Promise<RecoveryCodeStatus> {
  return apiRequest<RecoveryCodeStatus>("/auth/mfa/recovery-codes", token);
}

async function loadInstitutionStaff(token: string, institutionId: string): Promise<InstitutionStaff[]> {
  return apiRequest<InstitutionStaff[]>(`/admin/institutions/${institutionId}/staff`, token);
}

export function FounderConsole() {
  const [activePage, setActivePage] = useState<PageKey>("Overview");
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [token, setToken] = useState<string | null>(null);
  const [founderName, setFounderName] = useState("Founder Admin");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [email, setEmail] = useState("founder@acadid.local");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionApplications, setInstitutionApplications] = useState<InstitutionApplication[]>([]);
  const [globalApiKeys, setGlobalApiKeys] = useState<GlobalApiKey[]>([]);
  const [developerRequests, setDeveloperRequests] = useState<DeveloperAccessRequest[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [recordRequests, setRecordRequests] = useState<RecordRequest[]>([]);
  const [invitationLeads, setInvitationLeads] = useState<InvitationLead[]>([]);
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [deadLetters, setDeadLetters] = useState<DeadLetterOverview | null>(null);
  const [webhookEndpoints, setWebhookEndpoints] = useState<WebhookEndpoint[]>([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [academicOperations, setAcademicOperations] = useState<AcademicOperations | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [revenueOverview, setRevenueOverview] = useState<RevenueOverview | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettingsResponse | null>(null);
  const [rateLimitPolicy, setRateLimitPolicy] = useState<RateLimitPolicyResponse | null>(null);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [institutionStaff, setInstitutionStaff] = useState<InstitutionStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffInviteForm, setStaffInviteForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "EXAM_OFFICER",
    permissions: "academic_setup:read, students:read, results:read, govern:review",
    assignedScopes: ""
  });
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [selectedDisputeId, setSelectedDisputeId] = useState("");
  const [selectedRecordRequestId, setSelectedRecordRequestId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedSections, setLoadedSections] = useState<Record<string, boolean>>({});
  const loadingSectionsRef = useRef<Set<PageKey>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [createdInvite, setCreatedInvite] = useState<CreatedRegistrarInvite | null>(null);
  const [createdStaffInvite, setCreatedStaffInvite] = useState<CreatedStaffInvite | null>(null);
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [totpEnableCode, setTotpEnableCode] = useState("");
  const [recoveryRotateCode, setRecoveryRotateCode] = useState("");
  const [recoveryCodeStatus, setRecoveryCodeStatus] = useState<RecoveryCodeStatus | null>(null);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<RecoveryCodeRotation | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [institutionSearch, setInstitutionSearch] = useState("");
  const [institutionTypeFilter, setInstitutionTypeFilter] = useState("ALL");
  const [institutionStateFilter, setInstitutionStateFilter] = useState("ALL");
  const [institutionStatusFilter, setInstitutionStatusFilter] = useState("ALL");
  const [institutionTierFilter, setInstitutionTierFilter] = useState("ALL");
  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState("ALL");
  const [apiKeySearch, setApiKeySearch] = useState("");
  const [apiKeyStatusFilter, setApiKeyStatusFilter] = useState("ALL");
  const [apiKeyOwnerFilter, setApiKeyOwnerFilter] = useState("ALL");
  const [developerStatusFilter, setDeveloperStatusFilter] = useState("ALL");
  const [disputeStatusFilter, setDisputeStatusFilter] = useState("ALL");
  const [disputeNoticeText, setDisputeNoticeText] = useState("Please review this dispute and provide supporting evidence through the institution dashboard.");
  const [disputeResolutionNote, setDisputeResolutionNote] = useState("");
  const [recordRequestSearch, setRecordRequestSearch] = useState("");
  const [recordRequestStatusFilter, setRecordRequestStatusFilter] = useState("ALL");
  const [recordRequestReviewStatus, setRecordRequestReviewStatus] = useState<RecordRequestStatus>("INSTITUTION_REVIEW");
  const [recordRequestNote, setRecordRequestNote] = useState("Reviewed from Founder Console.");
  const [verificationSearch, setVerificationSearch] = useState("");
  const [verificationOutcomeFilter, setVerificationOutcomeFilter] = useState("ALL");
  const [rateLimitCleanupHours, setRateLimitCleanupHours] = useState(24);
  const [idempotencyCleanupHours, setIdempotencyCleanupHours] = useState(24);
  const [rateLimitPolicyForm, setRateLimitPolicyForm] = useState<RateLimitPolicyControl>(defaultRateLimitPolicy);
  const [webhookSecret, setWebhookSecret] = useState<WebhookSecretResponse | null>(null);
  const [webhookEndpointForm, setWebhookEndpointForm] = useState({
    label: "Institution Partner Webhook",
    targetUrl: "https://partner.example.com/acadid/webhooks",
    eventTypes: "result.published, credential.issued, credential.revoked"
  });
  const [institutionForm, setInstitutionForm] = useState({
    officialName: "",
    type: "SECONDARY",
    state: "Lagos",
    tier: "ACTIVE"
  });
  const defaultProductOption = getProductOption("INSTITUTION_PORTAL");
  const [productKeyForm, setProductKeyForm] = useState({
    productCode: defaultProductOption.code,
    productName: defaultProductOption.name,
    label: `${defaultProductOption.name} Backend - Sandbox`,
    environment: "SANDBOX" as "SANDBOX" | "PRODUCTION",
    rateLimitPerMinute: defaultProductOption.rateLimitPerMinute,
    scopes: defaultProductOption.recommendedScopes
  });
  const [institutionKeyForm, setInstitutionKeyForm] = useState({
    label: "Live Results API - Sandbox",
    environment: "SANDBOX" as "SANDBOX" | "PRODUCTION",
    rateLimitPerMinute: 500,
    scopes: ["ingest:write", "govern:write", "verify:read"]
  });

  const selectedInstitution = institutions.find((institution) => institution.uuid === selectedInstitutionId);
  const selectedApplication = institutionApplications.find((application) => application.uuid === selectedApplicationId);
  const selectedDispute = disputes.find((dispute) => dispute.uuid === selectedDisputeId) ?? disputes[0] ?? null;
  const selectedRecordRequest = recordRequests.find((request) => request.uuid === selectedRecordRequestId) ?? recordRequests[0] ?? null;
  const activeKeys = globalApiKeys.filter((key) => key.status === "ACTIVE");
  const productApiKeys = globalApiKeys.filter((key) => key.ownerType === "PRODUCT");
  const institutionApiKeys = globalApiKeys.filter((key) => key.ownerType === "INSTITUTION");
  const pendingApplications = institutionApplications.filter((application) => application.status === "PENDING");
  const newApplications = institutionApplications.filter((application) => application.status === "PENDING");
  const needsMoreInfoApplications = institutionApplications.filter((application) => String(application.status) === "NEEDS_MORE_INFORMATION");
  const pendingDeveloperRequests = developerRequests.filter((request) => request.status === "PENDING");
  const failedWebhookDeliveries = webhookDeliveries.filter((delivery) => ["FAILED", "DEAD_LETTER"].includes(delivery.status));
  const retryingWebhookDeliveries = webhookDeliveries.filter((delivery) => ["PENDING", "RETRYING"].includes(delivery.status));
  const activeRecordRequests = recordRequests.filter((request) => ["SUBMITTED", "AWAITING_PAYMENT", "ASSIGNED", "INSTITUTION_REVIEW", "NEEDS_MORE_INFORMATION", "DISPUTED"].includes(request.status));
  const overdueRecordRequests = recordRequests.filter((request) => request.status === "ESCALATED" || (request.status !== "FULFILLED" && daysSince(request.submittedAt) >= 14));
  const escalatedRecordRequests = recordRequests.filter((request) => request.status === "ESCALATED");
  const openDisputes = disputes.filter((dispute) => ["OPEN", "IN_REVIEW"].includes(dispute.status));
  const escalatedDisputes = disputes.filter((dispute) => dispute.status === "ESCALATED");
  const failedVerifications = verificationLogs.filter((log) => ["FAILED", "REVOKED", "DENIED", "DISCREPANCY"].some((term) => log.outcome.toUpperCase().includes(term)));
  const failedJobsCount = deadLetters?.summary.failedJobs ?? 0;
  const failedNotificationsCount = deadLetters?.summary.failedNotifications ?? 0;
  const approvedDeveloperInstitutionIds = new Set(developerRequests.filter((request) => request.status === "APPROVED").map((request) => request.institutionId));
  const approvedDeveloperInstitutions = institutions.filter((institution) => approvedDeveloperInstitutionIds.has(institution.uuid));
  const founderInitials = initials(founderName);
  const pageBadges: Partial<Record<PageKey, number>> = {
    "Institution Applications": newApplications.length + needsMoreInfoApplications.length,
    "Developer Access Requests": pendingDeveloperRequests.length,
    Webhooks: failedWebhookDeliveries.length || retryingWebhookDeliveries.length,
    "Record Requests": overdueRecordRequests.length || activeRecordRequests.length,
    Disputes: escalatedDisputes.length || openDisputes.length,
    "Verification Logs": failedVerifications.length,
    "Background Jobs": failedJobsCount + failedNotificationsCount,
    "System Health": systemHealth?.overallStatus && systemHealth.overallStatus !== "OPERATIONAL" ? 1 : 0,
    Security: auditEvents.filter((event) => event.outcome === "FAILED" || event.outcome === "DENIED").length
  };

  const workspaceTabs = buildWorkspaceTabs(activePage, {
    applications: institutionApplications,
    apiKeys: globalApiKeys,
    auditEvents,
    deadLetters,
    developerRequests,
    disputes,
    failedVerifications,
    failedWebhookDeliveries,
    institutions,
    invitationLeads,
    recordRequests,
    systemHealth,
    webhookDeliveries,
    webhookEndpoints
  });
  const activeWorkspaceTab = activeTabs[activePage] ?? workspaceTabs[0]?.label ?? "Overview";

  const overviewMetrics = [
    { label: "Total Institutions", value: dashboardSummary?.metrics.totalInstitutions ?? institutions.length, helper: "Approved partners", tone: "accent", icon: "Institutions" },
    { label: "Pending Applications", value: dashboardSummary?.metrics.pendingApplications ?? pendingApplications.length, helper: "Needs your review", tone: "warning", icon: "Institution Applications" },
    { label: "Active Learners", value: dashboardSummary?.metrics.activeLearners ?? "--", helper: "Learner identities in Core Data Center", tone: "success", icon: "Overview" },
    { label: "Results Published", value: dashboardSummary?.metrics.resultsPublished ?? "--", helper: "Published academic records", tone: "warning", icon: "Verification Logs" },
    { label: "Credentials Issued", value: dashboardSummary?.metrics.credentialsIssued ?? "--", helper: "W3C VC-ready credential rows", tone: "accent", icon: "Security" },
    { label: "API Calls Today", value: dashboardSummary?.metrics.apiCallsToday ?? systemHealth?.metrics.gatewayRequestsToday ?? "--", helper: "Gateway activity today", tone: "success", icon: "API Keys" }
  ];

  const filteredInstitutions = useMemo(() => {
    const term = institutionSearch.trim().toLowerCase();
    return institutions.filter((institution) => {
      const matchesTerm =
        !term ||
        institution.officialName.toLowerCase().includes(term) ||
        institution.institutionId.toLowerCase().includes(term) ||
        institution.state.toLowerCase().includes(term);
      return (
        matchesTerm &&
        (institutionTypeFilter === "ALL" || institution.type === institutionTypeFilter) &&
        (institutionStateFilter === "ALL" || institution.state === institutionStateFilter) &&
        (institutionStatusFilter === "ALL" || institution.status === institutionStatusFilter) &&
        (institutionTierFilter === "ALL" || institution.tier === institutionTierFilter)
      );
    });
  }, [institutionSearch, institutionStateFilter, institutionStatusFilter, institutionTierFilter, institutionTypeFilter, institutions]);

  const filteredApplications = useMemo(() => {
    const term = applicationSearch.trim().toLowerCase();
    return institutionApplications.filter((application) => {
      const matchesTerm =
        !term ||
        application.officialName.toLowerCase().includes(term) ||
        application.contactEmail.toLowerCase().includes(term) ||
        application.state.toLowerCase().includes(term);
      return matchesTerm && (applicationStatusFilter === "ALL" || application.status === applicationStatusFilter);
    });
  }, [applicationSearch, applicationStatusFilter, institutionApplications]);

  const filteredApiKeys = useMemo(() => {
    const term = apiKeySearch.trim().toLowerCase();
    return globalApiKeys.filter((key) => {
      const matchesTerm =
        !term ||
        key.label.toLowerCase().includes(term) ||
        key.clientId.toLowerCase().includes(term) ||
        (key.ownerLabel ?? "").toLowerCase().includes(term) ||
        (key.ownerReference ?? "").toLowerCase().includes(term);
      return (
        matchesTerm &&
        (apiKeyStatusFilter === "ALL" || key.status === apiKeyStatusFilter) &&
        (apiKeyOwnerFilter === "ALL" || key.ownerType === apiKeyOwnerFilter)
      );
    });
  }, [apiKeyOwnerFilter, apiKeySearch, apiKeyStatusFilter, globalApiKeys]);

  const filteredDeveloperRequests = developerRequests.filter((request) => developerStatusFilter === "ALL" || request.status === developerStatusFilter);
  const filteredDisputes = disputes.filter((dispute) => disputeStatusFilter === "ALL" || dispute.status === disputeStatusFilter);
  const filteredRecordRequests = useMemo(() => {
    const term = recordRequestSearch.trim().toLowerCase();
    return recordRequests.filter((request) => {
      const matchesTerm =
        !term ||
        request.requestId.toLowerCase().includes(term) ||
        request.institutionNameSubmitted.toLowerCase().includes(term) ||
        (request.studentNumber ?? "").toLowerCase().includes(term) ||
        (request.departmentOrClass ?? "").toLowerCase().includes(term) ||
        (request.requesterName ?? "").toLowerCase().includes(term) ||
        (request.requesterEmail ?? "").toLowerCase().includes(term) ||
        (request.learner?.ain ?? "").toLowerCase().includes(term) ||
        (request.learner?.fullName ?? "").toLowerCase().includes(term) ||
        (request.institution?.officialName ?? "").toLowerCase().includes(term);
      return matchesTerm && (recordRequestStatusFilter === "ALL" || request.status === recordRequestStatusFilter);
    });
  }, [recordRequestSearch, recordRequestStatusFilter, recordRequests]);
  const filteredVerificationLogs = useMemo(() => {
    const term = verificationSearch.trim().toLowerCase();
    return verificationLogs.filter((log) => {
      const matchesTerm =
        !term ||
        log.ain.toLowerCase().includes(term) ||
        log.learnerName.toLowerCase().includes(term) ||
        log.institutionId.toLowerCase().includes(term) ||
        log.institutionName.toLowerCase().includes(term) ||
        log.institutionState.toLowerCase().includes(term) ||
        log.verifier.toLowerCase().includes(term) ||
        log.verifierType.toLowerCase().includes(term) ||
        log.credential.toLowerCase().includes(term) ||
        log.credentialType.toLowerCase().includes(term);
      return matchesTerm && (verificationOutcomeFilter === "ALL" || log.outcome === verificationOutcomeFilter);
    });
  }, [verificationLogs, verificationOutcomeFilter, verificationSearch]);

  useEffect(() => {
    const savedToken = window.localStorage.getItem("acadid_founder_token");
    const savedName = window.localStorage.getItem("acadid_founder_name");
    const savedMfa = window.localStorage.getItem("acadid_founder_mfa");
    if (savedToken) {
      setToken(savedToken);
      setFounderName(savedName ?? "Founder Admin");
      setMfaEnabled(savedMfa === "true");
      void refreshData(savedToken);
    }
  }, []);

  useEffect(() => {
    if (!token || !selectedInstitutionId || activePage !== "Institutions") {
      setInstitutionStaff([]);
      return;
    }
    void refreshInstitutionStaff(selectedInstitutionId, token);
  }, [activePage, selectedInstitutionId, token]);

  useEffect(() => {
    if (!token || loadedSections[activePage]) return;
    void refreshPageData(activePage, token);
  }, [activePage, loadedSections, token]);

  async function refreshInstitutionStaff(institutionId = selectedInstitutionId, activeToken = token) {
    if (!activeToken || !institutionId) return;
    setStaffLoading(true);
    try {
      setInstitutionStaff(await loadInstitutionStaff(activeToken, institutionId));
    } catch (error) {
      handleAuthenticatedError(error, "Could not load institution staff.");
    } finally {
      setStaffLoading(false);
    }
  }

  async function refreshData(activeToken = token) {
    if (!activeToken) return;
    setLoading(true);
    setNotice(null);
    try {
      const nextInstitutions = await apiRequest<Institution[]>("/admin/institutions", activeToken);
      const nextApplications = await apiRequest<InstitutionApplication[]>("/admin/institution-applications", activeToken);
      const nextGlobalKeys = await apiRequest<GlobalApiKey[]>("/admin/api-keys", activeToken);
      setInstitutions(nextInstitutions);
      setGlobalApiKeys(nextGlobalKeys);
      setInstitutionApplications(nextApplications);
      setSelectedInstitutionId((current) => current || nextInstitutions[0]?.uuid || "");
      setSelectedApplicationId((current) => current || nextApplications[0]?.uuid || "");
      setLoading(false);
      setLoadedSections({});
    } catch (error) {
      handleAuthenticatedError(error, "Could not load console data.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshPageData(page: PageKey, activeToken = token, currentInstitutions = institutions) {
    if (!activeToken) return;
    if (loadingSectionsRef.current.has(page)) return;
    loadingSectionsRef.current.add(page);
    const loadOptional = async <T,>(label: string, loader: () => Promise<T>, apply: (value: T) => void) => {
      try {
        apply(await loader());
      } catch (error) {
        if (isSessionExpired(error)) {
          logout({ tone: "error", text: "Founder session expired. Please sign in again." });
          throw error;
        }
        console.warn(`AcadID Founder Console skipped ${label}:`, error);
      }
    };

    try {
      if (page === "Overview") {
        await loadOptional("dashboard summary", () => loadDashboardSummary(activeToken), setDashboardSummary);
      } else if (page === "Institutions") {
        await loadOptional("developer access requests", () => loadDeveloperAccessRequests(activeToken), (nextDeveloperRequests) => {
          setDeveloperRequests(nextDeveloperRequests);
          const approvedDeveloperInstitutionIds = new Set(nextDeveloperRequests.filter((request) => request.status === "APPROVED").map((request) => request.institutionId));
          setSelectedInstitutionId((current) => current || currentInstitutions.find((institution) => approvedDeveloperInstitutionIds.has(institution.uuid))?.uuid || currentInstitutions[0]?.uuid || "");
        });
        await loadOptional("verification logs", () => loadVerificationLogs(activeToken), setVerificationLogs);
        await loadOptional("audit events", () => loadAuditEvents(activeToken), setAuditEvents);
      } else if (page === "Academic Operations") {
        await loadOptional("academic operations", () => loadAcademicOperations(activeToken), setAcademicOperations);
        await loadOptional("invitation leads", () => loadInvitationLeads(activeToken), setInvitationLeads);
      } else if (page === "API Keys") {
        await loadOptional("developer access requests", () => loadDeveloperAccessRequests(activeToken), setDeveloperRequests);
      } else if (page === "Developer Access Requests") {
        await loadOptional("developer access requests", () => loadDeveloperAccessRequests(activeToken), setDeveloperRequests);
      } else if (page === "Webhooks") {
        await loadOptional("system health", () => loadSystemHealth(activeToken), setSystemHealth);
        await loadOptional("dead letters", () => loadDeadLetters(activeToken), setDeadLetters);
        await loadOptional("webhook endpoints", () => loadWebhookEndpoints(activeToken), setWebhookEndpoints);
        await loadOptional("webhook deliveries", () => loadWebhookDeliveries(activeToken), setWebhookDeliveries);
      } else if (page === "Disputes") {
        await loadOptional("disputes", () => loadDisputes(activeToken), (nextDisputes) => {
          setDisputes(nextDisputes);
          setSelectedDisputeId((current) => current || nextDisputes[0]?.uuid || "");
        });
      } else if (page === "Record Requests") {
        await loadOptional("record requests", () => loadRecordRequests(activeToken), (nextRecordRequests) => {
          setRecordRequests(nextRecordRequests);
          setSelectedRecordRequestId((current) => current || nextRecordRequests[0]?.uuid || "");
        });
      } else if (page === "Verification Logs") {
        await loadOptional("verification logs", () => loadVerificationLogs(activeToken), setVerificationLogs);
      } else if (page === "Background Jobs") {
        await loadOptional("system health", () => loadSystemHealth(activeToken), setSystemHealth);
        await loadOptional("dead letters", () => loadDeadLetters(activeToken), setDeadLetters);
      } else if (page === "Revenue") {
        await loadOptional("revenue", () => loadRevenueOverview(activeToken), setRevenueOverview);
      } else if (page === "Billing") {
        await loadOptional("revenue", () => loadRevenueOverview(activeToken), setRevenueOverview);
      } else if (page === "Reports") {
        await loadOptional("revenue", () => loadRevenueOverview(activeToken), setRevenueOverview);
        await loadOptional("audit events", () => loadAuditEvents(activeToken), setAuditEvents);
      } else if (page === "System Health") {
        await loadOptional("system health", () => loadSystemHealth(activeToken), setSystemHealth);
        await loadOptional("rate-limit policy", () => loadRateLimitPolicy(activeToken), (nextRateLimitPolicy) => {
          setRateLimitPolicy(nextRateLimitPolicy);
          setRateLimitPolicyForm(nextRateLimitPolicy.policy);
        });
        await loadOptional("dead letters", () => loadDeadLetters(activeToken), setDeadLetters);
        await loadOptional("webhook endpoints", () => loadWebhookEndpoints(activeToken), setWebhookEndpoints);
        await loadOptional("webhook deliveries", () => loadWebhookDeliveries(activeToken), setWebhookDeliveries);
      } else if (page === "Security") {
        await loadOptional("audit events", () => loadAuditEvents(activeToken), setAuditEvents);
        await loadOptional("recovery code status", () => loadRecoveryCodeStatus(activeToken), setRecoveryCodeStatus);
      } else if (page === "Audit Logs") {
        await loadOptional("audit events", () => loadAuditEvents(activeToken), setAuditEvents);
      } else if (page === "Settings") {
        await loadOptional("platform settings", () => loadPlatformSettings(activeToken), setPlatformSettings);
      }

      setLoadedSections((current) => ({ ...current, [page]: true }));
    } finally {
      loadingSectionsRef.current.delete(page);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      const login = await apiRequest<LoginResponse>("/auth/login", null, {
        method: "POST",
        body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}), ...(recoveryCode ? { recoveryCode } : {}) })
      });
      setToken(login.accessToken);
      setFounderName(login.user.fullName);
      setMfaEnabled(login.user.mfaEnabled);
      window.localStorage.setItem("acadid_founder_token", login.accessToken);
      window.localStorage.setItem("acadid_founder_name", login.user.fullName);
      window.localStorage.setItem("acadid_founder_mfa", String(login.user.mfaEnabled));
      setPassword("");
      setTotpCode("");
      setRecoveryCode("");
      setNotice({ tone: "success", text: "Founder login confirmed." });
      await refreshData(login.accessToken);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Login failed." });
    } finally {
      setLoading(false);
    }
  }

  function logout(nextNotice: Notice | null = null) {
    window.localStorage.removeItem("acadid_founder_token");
    window.localStorage.removeItem("acadid_founder_name");
    window.localStorage.removeItem("acadid_founder_mfa");
    setToken(null);
    setInstitutions([]);
    setInstitutionStaff([]);
    setInstitutionApplications([]);
    setGlobalApiKeys([]);
    setDeveloperRequests([]);
    setDisputes([]);
    setSelectedDisputeId("");
    setRecordRequests([]);
    setInvitationLeads([]);
    setSelectedRecordRequestId("");
    setVerificationLogs([]);
    setSystemHealth(null);
    setRateLimitPolicy(null);
    setRateLimitPolicyForm(defaultRateLimitPolicy);
    setDeadLetters(null);
    setWebhookEndpoints([]);
    setWebhookDeliveries([]);
    setWebhookSecret(null);
    setDashboardSummary(null);
    setAcademicOperations(null);
    setAuditEvents([]);
    setRevenueOverview(null);
    setPlatformSettings(null);
    setNotice(nextNotice);
    setTotpSetup(null);
    setRecoveryCodeStatus(null);
      setNewRecoveryCodes(null);
      setCreatedInvite(null);
      setCreatedStaffInvite(null);
      setRecoveryRotateCode("");
    setMfaEnabled(false);
  }

  function handleAuthenticatedError(error: unknown, fallback: string) {
    if (isSessionExpired(error)) {
      logout({ tone: "error", text: "Founder session expired. Please sign in again." });
      return;
    }
    if (isDatabaseUnavailable(error)) {
      setNotice({
        tone: "warning",
        text: "Supabase database is temporarily unreachable. Your console is still open; check Supabase connectivity, then try again."
      });
      return;
    }
    setNotice({ tone: "error", text: error instanceof Error ? error.message : fallback });
  }

  function navigate(page: PageKey) {
    setActivePage(page);
    setDrawerOpen(false);
  }

  async function queueRateLimitCleanup() {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest<{ jobId: string; olderThanHours: number }>("/admin/rate-limits/cleanup", token, {
        method: "POST",
        body: JSON.stringify({ olderThanHours: rateLimitCleanupHours })
      });
      setNotice({ tone: "success", text: `Rate-limit cleanup queued for buckets older than ${response.olderThanHours} hour(s). Job ${response.jobId}.` });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Rate-limit cleanup could not be queued.");
    } finally {
      setLoading(false);
    }
  }

  async function saveRateLimitPolicy() {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest<RateLimitPolicyResponse>("/admin/rate-limits/policy", token, {
        method: "PATCH",
        body: JSON.stringify(rateLimitPolicyForm)
      });
      setRateLimitPolicy(response);
      setRateLimitPolicyForm(response.policy);
      setNotice({ tone: "success", text: "Rate-limit policy updated. New API requests will use it within a few seconds." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Unable to update rate-limit policy.");
    } finally {
      setLoading(false);
    }
  }

  async function createWebhookEndpoint() {
    if (!token || !selectedInstitutionId) {
      setNotice({ tone: "error", text: "Select an institution before creating a webhook endpoint." });
      return;
    }
    setLoading(true);
    try {
      const response = await apiRequest<WebhookSecretResponse>(`/admin/institutions/${selectedInstitutionId}/webhook-endpoints`, token, {
        method: "POST",
        body: JSON.stringify({
          label: webhookEndpointForm.label,
          targetUrl: webhookEndpointForm.targetUrl,
          eventTypes: webhookEndpointForm.eventTypes
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        })
      });
      setWebhookSecret(response);
      setNotice({ tone: "success", text: "Webhook endpoint created. Copy the secret now; it is shown once." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Unable to create webhook endpoint.");
    } finally {
      setLoading(false);
    }
  }

  async function rotateWebhookEndpointSecret(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest<WebhookSecretResponse>(`/admin/webhook-endpoints/${id}/rotate-secret`, token, { method: "POST" });
      setWebhookSecret(response);
      setNotice({ tone: "success", text: "Webhook secret rotated. Update the partner system with the new secret." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Unable to rotate webhook secret.");
    } finally {
      setLoading(false);
    }
  }

  async function updateWebhookEndpointStatus(id: string, status: string) {
    if (!token) return;
    setLoading(true);
    try {
      await apiRequest<WebhookEndpoint>(`/admin/webhook-endpoints/${id}/status`, token, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setNotice({ tone: "success", text: `Webhook endpoint marked ${status.toLowerCase()}.` });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Unable to update webhook endpoint.");
    } finally {
      setLoading(false);
    }
  }

  async function retryWebhookDelivery(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/webhook-deliveries/${id}/retry`, token, { method: "POST" });
      setNotice({ tone: "success", text: "Webhook delivery retry queued." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Unable to retry webhook delivery.");
    } finally {
      setLoading(false);
    }
  }

  async function replayWebhookDelivery(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/webhook-deliveries/${id}/replay`, token, { method: "POST" });
      setNotice({ tone: "success", text: "Webhook replay queued with a new delivery idempotency key." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Unable to replay webhook delivery.");
    } finally {
      setLoading(false);
    }
  }

  async function queueIdempotencyCleanup() {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest<{ jobId: string; olderThanHours: number }>("/admin/idempotency-records/cleanup", token, {
        method: "POST",
        body: JSON.stringify({ olderThanHours: idempotencyCleanupHours })
      });
      setNotice({ tone: "success", text: `Idempotency cleanup queued for expired records older than ${response.olderThanHours} hour(s). Job ${response.jobId}.` });
      await refreshData();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to queue idempotency cleanup." });
    } finally {
      setLoading(false);
    }
  }

  async function retryNotification(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest<{ jobId: string; notificationId: string }>(`/admin/notifications/${id}/retry`, token, {
        method: "POST"
      });
      setNotice({ tone: "success", text: `Notification retry queued. Job ${response.jobId}.` });
      await refreshData();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to retry notification." });
    } finally {
      setLoading(false);
    }
  }

  async function retryDeadLetterJob(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest<{ job: { id: string; type: string } }>(`/admin/dead-letters/jobs/${id}/retry`, token, {
        method: "POST"
      });
      setNotice({ tone: "success", text: `Dead-letter job ${response.job.id} was requeued for ${titleCase(response.job.type)}.` });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Unable to retry dead-letter job.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateInstitution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      const institution = await apiRequest<Institution>("/admin/institutions", token, {
        method: "POST",
        body: JSON.stringify(institutionForm)
      });
      setInstitutionForm({ ...institutionForm, officialName: "" });
      setSelectedInstitutionId(institution.uuid);
      setNotice({ tone: "success", text: `Created ${institution.institutionId}.` });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Institution creation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function updateInstitutionStatus(id: string, status: "ACTIVE" | "SUSPENDED") {
    if (!token) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/institutions/${id}/status`, token, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setNotice({ tone: "success", text: status === "ACTIVE" ? "Institution reactivated." : "Institution suspended." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Institution status update failed.");
    } finally {
      setLoading(false);
    }
  }

  async function inviteInstitutionStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedInstitutionId) return;
    setLoading(true);
    try {
      const response = await apiRequest<CreatedStaffInvite>(`/admin/institutions/${selectedInstitutionId}/staff/invite`, token, {
        method: "POST",
        body: JSON.stringify({
          fullName: staffInviteForm.fullName,
          email: staffInviteForm.email,
          phone: staffInviteForm.phone || undefined,
          role: staffInviteForm.role,
          permissions: parseCsv(staffInviteForm.permissions),
          assignedScopes: parseAssignedScopesText(staffInviteForm.assignedScopes)
        })
      });
      setCreatedStaffInvite(response);
      setStaffInviteForm({
        ...staffInviteForm,
        fullName: "",
        email: "",
        phone: "",
        assignedScopes: ""
      });
      setNotice({ tone: "success", text: "Institution staff invite created. Save the one-time invite token now." });
      await refreshInstitutionStaff();
    } catch (error) {
      handleAuthenticatedError(error, "Staff invitation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function updateInstitutionStaff(staffId: string, body: Record<string, unknown>) {
    if (!token) return;
    setLoading(true);
    try {
      await apiRequest<InstitutionStaff>(`/admin/institution-staff/${staffId}`, token, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      setNotice({ tone: "success", text: "Institution staff access updated." });
      await refreshInstitutionStaff();
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Staff access update failed.");
    } finally {
      setLoading(false);
    }
  }

  async function approveInstitutionApplication(applicationId: string) {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest<CreatedRegistrarInvite>(`/admin/institution-applications/${applicationId}/approve`, token, { method: "POST" });
      setCreatedInvite(response);
      setNotice({ tone: "success", text: "Institution application approved, workspace created, and Registrar invite generated." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Application approval failed.");
    } finally {
      setLoading(false);
    }
  }

  async function rejectInstitutionApplication(applicationId: string) {
    if (!token) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/institution-applications/${applicationId}/reject`, token, {
        method: "POST",
        body: JSON.stringify({ feedback: "Rejected from Founder Console." })
      });
      setNotice({ tone: "success", text: "Institution application rejected." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Application rejection failed.");
    } finally {
      setLoading(false);
    }
  }

  async function requestInstitutionApplicationInfo(applicationId: string) {
    if (!token) return;
    const message = window.prompt("What information should this institution provide?", "Please provide the missing registration document or clarification requested by ACAD.ID.");
    if (!message?.trim()) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/institution-applications/${applicationId}/request-info`, token, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      setNotice({ tone: "success", text: "More-information request recorded for this application." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Application information request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function sendInstitutionApplicationEmail(applicationId: string) {
    if (!token) return;
    const application = institutionApplications.find((item) => item.uuid === applicationId);
    const message = window.prompt("Email message to record for this institution", `Hello ${application?.contactPersonName ?? "there"}, your ACAD.ID institution application has an update in Founder review.`);
    if (!message?.trim()) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/institution-applications/${applicationId}/send-email`, token, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      setNotice({ tone: "success", text: "Application email action recorded for provider delivery." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Application email action failed.");
    } finally {
      setLoading(false);
    }
  }

  async function updateDeveloperAccessRequest(requestId: string, action: "approve" | "reject" | "suspend") {
    if (!token) return;
    setLoading(true);
    try {
      const actionPast = action === "approve" ? "approved" : action === "reject" ? "rejected" : "suspended";
      await apiRequest(`/admin/developer-access-requests/${requestId}/${action}`, token, {
        method: "POST",
        body: JSON.stringify({ feedback: `${actionPast} from Founder Console.` })
      });
      setNotice({ tone: "success", text: `Developer access request ${actionPast}.` });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Developer access update failed.");
    } finally {
      setLoading(false);
    }
  }

  async function assignDispute(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      const dispute = await apiRequest<Dispute>(`/admin/disputes/${id}/assign`, token, {
        method: "POST",
        body: JSON.stringify({})
      });
      setSelectedDisputeId(dispute.uuid);
      setNotice({ tone: "success", text: "Dispute assigned to founder console." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Dispute assignment failed.");
    } finally {
      setLoading(false);
    }
  }

  async function sendDisputeNotice(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      const dispute = await apiRequest<Dispute>(`/admin/disputes/${id}/send-notice`, token, {
        method: "POST",
        body: JSON.stringify({ message: disputeNoticeText })
      });
      setSelectedDisputeId(dispute.uuid);
      setNotice({ tone: "success", text: "Institution notice recorded for this dispute." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Dispute notice failed.");
    } finally {
      setLoading(false);
    }
  }

  async function escalateDispute(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      const dispute = await apiRequest<Dispute>(`/admin/disputes/${id}/escalate`, token, {
        method: "POST",
        body: JSON.stringify({ reason: "Escalated by founder console for priority review." })
      });
      setSelectedDisputeId(dispute.uuid);
      setNotice({ tone: "success", text: "Dispute escalated." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Dispute escalation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function closeDispute(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      const dispute = await apiRequest<Dispute>(`/admin/disputes/${id}/close`, token, {
        method: "POST",
        body: JSON.stringify({ resolutionNote: disputeResolutionNote })
      });
      setSelectedDisputeId(dispute.uuid);
      setDisputeResolutionNote("");
      setNotice({ tone: "success", text: "Dispute closed with resolution note." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Dispute closure failed.");
    } finally {
      setLoading(false);
    }
  }

  async function reviewRecordRequest(id: string, status: RecordRequestStatus) {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest<{ accepted: boolean; request: RecordRequest }>(`/govern/record-requests/${id}/review`, token, {
        method: "POST",
        body: JSON.stringify({
          status,
          note: recordRequestNote || `Marked ${titleCase(status)} from Founder Console.`,
          ...(status === "REJECTED" ? { rejectionReason: recordRequestNote || "Rejected from Founder Console." } : {}),
          ...(status === "ESCALATED" ? { escalationReason: recordRequestNote || "Escalated from Founder Console." } : {}),
          ...(status === "FULFILLED" ? { resolutionNote: recordRequestNote || "Fulfilled from Founder Console." } : {})
        })
      });
      setRecordRequests((current) => current.map((request) => (request.uuid === response.request.uuid ? response.request : request)));
      setSelectedRecordRequestId(response.request.uuid);
      setNotice({ tone: "success", text: `Record request ${response.request.requestId} moved to ${titleCase(status)}.` });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Record request review failed.");
    } finally {
      setLoading(false);
    }
  }

  async function updateInvitationLead(id: string, status: InvitationLeadStatus) {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest<{ accepted: boolean; lead: InvitationLead }>(`/admin/invitation-leads/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          note: `Marked ${titleCase(status)} from Founder Console.`
        })
      });
      setInvitationLeads((current) => current.map((lead) => (lead.uuid === response.lead.uuid ? response.lead : lead)));
      setNotice({ tone: "success", text: `${response.lead.institutionName} invitation lead moved to ${titleCase(status)}.` });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Invitation lead update failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProductApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      const apiKey = await apiRequest<CreatedApiKey>("/admin/product-api-keys", token, {
        method: "POST",
        body: JSON.stringify(productKeyForm)
      });
      setCreatedKey(apiKey);
      setNotice({ tone: "success", text: "Product API key generated. Save the backend secret now." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Product API key generation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateInstitutionApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedInstitutionId) return;
    setLoading(true);
    try {
      const apiKey = await apiRequest<CreatedApiKey>(`/admin/institutions/${selectedInstitutionId}/api-keys`, token, {
        method: "POST",
        body: JSON.stringify(institutionKeyForm)
      });
      setCreatedKey(apiKey);
      setNotice({ tone: "success", text: "Institution Live Results API key generated." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Institution API key generation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function revokeApiKey(apiKeyId: string) {
    if (!token) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/api-keys/${apiKeyId}/revoke`, token, {
        method: "PATCH",
        body: JSON.stringify({ reason: "Revoked from Founder Console." })
      });
      setNotice({ tone: "success", text: "API key revoked." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "API key revocation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function regenerateApiKey(apiKeyId: string) {
    if (!token) return;
    setLoading(true);
    try {
      const apiKey = await apiRequest<CreatedApiKey>(`/admin/api-keys/${apiKeyId}/regenerate`, token, { method: "PATCH" });
      setCreatedKey(apiKey);
      setNotice({ tone: "success", text: "API key regenerated. Save the new secret now and rotate it in the backend." });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "API key regeneration failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupTotp() {
    if (!token) return;
    setLoading(true);
    try {
      const setup = await apiRequest<TotpSetup>("/auth/mfa/setup", token, { method: "POST" });
      setTotpSetup(setup);
      setTotpEnableCode("");
      setNotice({ tone: "success", text: "Authenticator setup started. Enter the code from your app to enable it." });
    } catch (error) {
      handleAuthenticatedError(error, "Could not start TOTP setup.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnableTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      await apiRequest("/auth/mfa/enable", token, {
        method: "POST",
        body: JSON.stringify({ code: totpEnableCode })
      });
      setMfaEnabled(true);
      window.localStorage.setItem("acadid_founder_mfa", "true");
      setTotpSetup(null);
      setTotpEnableCode("");
      setNotice({ tone: "success", text: "Founder TOTP is now enabled. Future logins require the 6-digit code." });
    } catch (error) {
      handleAuthenticatedError(error, "Could not enable TOTP.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRotateRecoveryCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      const rotated = await apiRequest<RecoveryCodeRotation>("/auth/mfa/recovery-codes/rotate", token, {
        method: "POST",
        body: JSON.stringify({ code: recoveryRotateCode })
      });
      setNewRecoveryCodes(rotated);
      setRecoveryRotateCode("");
      setRecoveryCodeStatus(await loadRecoveryCodeStatus(token));
      setNotice({ tone: "success", text: "New founder recovery codes generated. Save them now." });
    } catch (error) {
      handleAuthenticatedError(error, "Could not rotate recovery codes.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(nextSettings: PlatformSettings) {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest<PlatformSettingsResponse>("/admin/settings", token, {
        method: "PATCH",
        body: JSON.stringify(nextSettings)
      });
      setPlatformSettings(response);
      setNotice({ tone: "success", text: "Platform settings saved." });
    } catch (error) {
      handleAuthenticatedError(error, "Could not save platform settings.");
    } finally {
      setLoading(false);
    }
  }

  async function emergencyLockdown() {
    if (!token) return;
    const confirmation = window.prompt("Type LOCKDOWN to revoke all active API keys and stop external gateway access.");
    if (confirmation !== "LOCKDOWN") return;
    const reason = window.prompt("Reason for emergency lockdown", "Founder emergency lockdown from Security page.") ?? undefined;
    setLoading(true);
    try {
      const response = await apiRequest<{ revokedApiKeys: number }>("/admin/emergency-lockdown", token, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      setNotice({ tone: "success", text: `Emergency lockdown complete. ${response.revokedApiKeys} active API key(s) revoked.` });
      await refreshData();
    } catch (error) {
      handleAuthenticatedError(error, "Emergency lockdown failed.");
    } finally {
      setLoading(false);
    }
  }

  function toggleProductScope(scope: string) {
    const scopes = productKeyForm.scopes.includes(scope)
      ? productKeyForm.scopes.filter((item) => item !== scope)
      : [...productKeyForm.scopes, scope];
    setProductKeyForm({ ...productKeyForm, scopes });
  }

  function toggleInstitutionScope(scope: string) {
    const scopes = institutionKeyForm.scopes.includes(scope)
      ? institutionKeyForm.scopes.filter((item) => item !== scope)
      : [...institutionKeyForm.scopes, scope];
    setInstitutionKeyForm({ ...institutionKeyForm, scopes });
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-soft px-4 py-8 text-textPrimary">
        <section className="mx-auto max-w-md rounded-xl border border-borderLight bg-white p-6 shadow-sm">
          <BrandMark />
          <h1 className="mt-6 text-2xl font-semibold text-primary">Founder Console</h1>
          <p className="mt-2 text-sm leading-6 text-textSecondary">Sign in to manage ACAD.ID infrastructure, institutions, and gateway access.</p>
          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <Field label="Email">
              <input className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </Field>
            <Field label="Password">
              <input className={inputClass} value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
            </Field>
            <Field label="Authenticator code">
              <input className={inputClass} value={totpCode} onChange={(event) => setTotpCode(event.target.value)} inputMode="numeric" placeholder="Required after TOTP is enabled" />
            </Field>
            <Field label="Recovery code">
              <input className={inputClass} value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} placeholder="Use only if authenticator is unavailable" />
            </Field>
            <button className={primaryButtonClass} disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
          </form>
          {notice ? <NoticeMessage notice={notice} /> : <EmptyState text="No active founder session." />}
        </section>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-soft text-textPrimary">
      <div className="flex h-full">
        <div className={`fixed inset-0 z-30 bg-primary/40 lg:hidden ${drawerOpen ? "block" : "hidden"}`} onClick={() => setDrawerOpen(false)} />
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-screen flex-col bg-primary text-white transition-all duration-200 lg:static ${
            drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          } ${sidebarCollapsed ? "w-20" : "w-72"}`}
        >
          <div className="border-b border-white/10 p-5">
            <BrandMark inverse compact={sidebarCollapsed} />
            {!sidebarCollapsed ? <p className="mt-1 text-xs text-white/60">Academic Identity Platform</p> : null}
          </div>
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {navGroups.map((group) => (
              <div key={group.label} className="space-y-1">
                {!sidebarCollapsed ? <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-white/45">{group.label}</p> : null}
                {group.items.map((item) => {
                  const badgeCount = pageBadges[item] ?? 0;
                  return (
                    <button
                      key={item}
                      className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium ${
                        activePage === item ? "bg-accent text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                      } ${sidebarCollapsed ? "justify-center" : ""}`}
                      onClick={() => navigate(item)}
                      title={sidebarCollapsed ? item : undefined}
                      type="button"
                    >
                      <SideIcon label={item} active={activePage === item} inverse />
                      {sidebarCollapsed ? null : <span className="min-w-0 flex-1 truncate">{item}</span>}
                      {!sidebarCollapsed && badgeCount > 0 ? <Badge>{badgeCount > 99 ? "99+" : badgeCount}</Badge> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="space-y-3 border-t border-white/10 p-4">
            <div className={`rounded-lg border border-white/10 bg-white/5 p-3 ${sidebarCollapsed ? "text-center" : ""}`}>
              <div className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">{founderInitials}</div>
                {sidebarCollapsed ? null : (
                  <div>
                    <p className="text-sm font-semibold">Founder Console</p>
                    <p className="text-xs text-white/60">Super Admin Access</p>
                  </div>
                )}
              </div>
              {!sidebarCollapsed ? (
                <button className="mt-4 flex w-full items-center gap-2 border-t border-white/10 pt-3 text-left text-sm text-white/80" type="button">
                  <SideIcon label="Support" inverse /> Contact support
                </button>
              ) : null}
            </div>
            <button className={`flex h-10 w-full items-center rounded-md px-3 text-sm font-medium text-white/85 hover:bg-white/10 ${sidebarCollapsed ? "justify-center" : "gap-3"}`} onClick={() => logout()} type="button">
              <SideIcon label="Logout" inverse />
              {sidebarCollapsed ? null : "Logout"}
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-borderLight bg-white px-4 lg:px-6">
            <button className="flex h-10 w-10 items-center justify-center rounded-md border border-borderLight text-primary hover:border-accent lg:hidden" onClick={() => setDrawerOpen(true)} type="button">
              <MenuIcon />
            </button>
            <button className="hidden h-10 w-10 items-center justify-center rounded-md border border-borderLight text-primary hover:border-accent lg:flex" onClick={() => setSidebarCollapsed((current) => !current)} type="button">
              <MenuIcon />
            </button>
            <div className="relative min-w-0 flex-1 lg:max-w-xl">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary">
                <SearchIcon />
              </span>
              <input className={`${inputClass} pl-10`} placeholder="Search institutions, applications, AIN, API keys..." value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} />
            </div>
            <HeaderIcon label="Notifications" badge="8"><BellIcon /></HeaderIcon>
            <HeaderIcon label="Help"><HelpIcon /></HeaderIcon>
            <button className="flex items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-soft" type="button">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{founderInitials}</div>
              <div className="hidden md:block">
                <p className="text-sm font-semibold text-primary">{founderName}</p>
                <p className="text-xs text-textSecondary">Super Admin</p>
              </div>
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="mx-auto max-w-[1440px] space-y-5">
              <PageHeading activePage={activePage} onGenerateKey={() => setActivePage("API Keys")} updatedAt={latestWorkspaceUpdate(activePage, { dashboardSummary, systemHealth, deadLetters, revenueOverview })} />
              <WorkspaceTabs tabs={workspaceTabs} activeTab={activeWorkspaceTab} onChange={(tab) => setActiveTabs((current) => ({ ...current, [activePage]: tab }))} />
              {notice ? <NoticeMessage notice={notice} /> : null}
              {loading ? <LoadingBar /> : null}
              {renderActivePage()}
              <footer className="flex items-center justify-between py-2 text-xs text-textSecondary">
                <span>(c) 2026 ACAD.ID. All rights reserved.</span>
                <span>Version 2.1.0</span>
              </footer>
            </div>
          </div>
        </section>
      </div>
      {createdKey ? <SecretModal apiKey={createdKey} onClose={() => setCreatedKey(null)} /> : null}
      {createdInvite ? <RegistrarInviteModal invite={createdInvite} onClose={() => setCreatedInvite(null)} /> : null}
      {createdStaffInvite ? <StaffInviteModal invite={createdStaffInvite} onClose={() => setCreatedStaffInvite(null)} /> : null}
    </main>
  );

  function renderActivePage() {
    if (activePage === "Overview") {
      return (
        <OverviewPage
          apiKeys={globalApiKeys}
          applications={institutionApplications}
          dashboardSummary={dashboardSummary}
          institutions={institutions}
          metrics={overviewMetrics}
          onGenerateKey={() => setActivePage("API Keys")}
          onViewApplications={() => setActivePage("Institution Applications")}
          systemHealth={systemHealth}
        />
      );
    }
    if (activePage === "Institutions") {
      return (
        <InstitutionsPage
          filteredInstitutions={filterInstitutionsForTab(filteredInstitutions, activeWorkspaceTab)}
          institutionForm={institutionForm}
          institutionSearch={institutionSearch}
          institutionStateFilter={institutionStateFilter}
          institutionStatusFilter={institutionStatusFilter}
          institutionTierFilter={institutionTierFilter}
          institutionTypeFilter={institutionTypeFilter}
          institutions={institutions}
            loading={loading}
            institutionStaff={institutionStaff}
            staffInviteForm={staffInviteForm}
            staffLoading={staffLoading}
            apiKeys={globalApiKeys}
            auditEvents={auditEvents}
            developerRequests={developerRequests}
            onCreateInstitution={handleCreateInstitution}
            onInviteStaff={inviteInstitutionStaff}
            onSelectInstitution={setSelectedInstitutionId}
            onStateFilter={setInstitutionStateFilter}
            onUpdateStaff={updateInstitutionStaff}
            onUpdateStaffInviteForm={setStaffInviteForm}
            onStatusFilter={setInstitutionStatusFilter}
          onTierFilter={setInstitutionTierFilter}
          onTypeFilter={setInstitutionTypeFilter}
          onUpdateInstitutionForm={setInstitutionForm}
          onUpdateSearch={setInstitutionSearch}
          onUpdateStatus={updateInstitutionStatus}
          verificationLogs={verificationLogs}
          selectedInstitution={selectedInstitution}
        />
      );
    }
    if (activePage === "Academic Operations") {
      return (
        <AcademicOperationsPage
          invitationLeads={invitationLeads}
          loading={loading}
          onUpdateInvitationLead={updateInvitationLead}
          onViewHealth={() => setActivePage("System Health")}
          operations={academicOperations}
        />
      );
    }
    if (activePage === "Institution Applications") {
      return (
        <ApplicationsPage
          applicationSearch={applicationSearch}
          applicationStatusFilter={applicationStatusFilter}
          applications={filterApplicationsForTab(filteredApplications, activeWorkspaceTab)}
          loading={loading}
          onApprove={approveInstitutionApplication}
          onReject={rejectInstitutionApplication}
          onRequestInfo={requestInstitutionApplicationInfo}
          onSendEmail={sendInstitutionApplicationEmail}
          onSelectApplication={setSelectedApplicationId}
          onStatusFilter={setApplicationStatusFilter}
          onUpdateSearch={setApplicationSearch}
          selectedApplication={selectedApplication}
        />
      );
    }
    if (activePage === "API Keys") {
      const apiKeysForTab = filterApiKeysForTab(filteredApiKeys, activeWorkspaceTab);
      return (
        <ApiKeysPage
          apiKeyOwnerFilter={apiKeyOwnerFilter}
          apiKeySearch={apiKeySearch}
          apiKeyStatusFilter={apiKeyStatusFilter}
          approvedDeveloperInstitutions={approvedDeveloperInstitutions}
          filteredApiKeys={apiKeysForTab}
          institutionApiKeys={institutionApiKeys}
          institutionKeyForm={institutionKeyForm}
          institutions={institutions}
          loading={loading}
          onCreateInstitutionKey={handleCreateInstitutionApiKey}
          onCreateProductKey={handleCreateProductApiKey}
          onOwnerFilter={setApiKeyOwnerFilter}
          onRegenerate={regenerateApiKey}
          onRevoke={revokeApiKey}
          onSelectInstitution={setSelectedInstitutionId}
          onStatusFilter={setApiKeyStatusFilter}
          onToggleInstitutionScope={toggleInstitutionScope}
          onToggleProductScope={toggleProductScope}
          onUpdateInstitutionKeyForm={setInstitutionKeyForm}
          onUpdateProductKeyForm={setProductKeyForm}
          onUpdateSearch={setApiKeySearch}
          productApiKeys={productApiKeys}
          productKeyForm={productKeyForm}
          selectedInstitutionId={selectedInstitutionId}
        />
      );
    }
    if (activePage === "Developer Access Requests") {
      return <DeveloperRequestsPage loading={loading} onUpdate={updateDeveloperAccessRequest} requests={filterDeveloperRequestsForTab(filteredDeveloperRequests, activeWorkspaceTab)} statusFilter={developerStatusFilter} onStatusFilter={setDeveloperStatusFilter} />;
    }
    if (activePage === "Webhooks") {
      return (
        <WebhooksPage
          deliveries={webhookDeliveries}
          endpoints={webhookEndpoints}
          endpointForm={webhookEndpointForm}
          loading={loading}
          onCreateEndpoint={createWebhookEndpoint}
          onReplayDelivery={replayWebhookDelivery}
          onRetryDelivery={retryWebhookDelivery}
          onRotateSecret={rotateWebhookEndpointSecret}
          onUpdateEndpointForm={setWebhookEndpointForm}
          onUpdateEndpointStatus={updateWebhookEndpointStatus}
          selectedInstitutionId={selectedInstitutionId}
          secret={webhookSecret}
          tab={activeWorkspaceTab}
        />
      );
    }
    if (activePage === "Disputes") {
      return (
        <DisputesPage
          disputes={filterDisputesForTab(filteredDisputes, activeWorkspaceTab)}
          loading={loading}
          noticeText={disputeNoticeText}
          onAssign={assignDispute}
          onClose={closeDispute}
          onEscalate={escalateDispute}
          onNoticeText={setDisputeNoticeText}
          onResolutionNote={setDisputeResolutionNote}
          onSelectDispute={setSelectedDisputeId}
          onSendNotice={sendDisputeNotice}
          onStatusFilter={setDisputeStatusFilter}
          resolutionNote={disputeResolutionNote}
          selectedDispute={selectedDispute}
          statusFilter={disputeStatusFilter}
        />
      );
    }
    if (activePage === "Record Requests") {
      return (
        <RecordRequestsPage
          loading={loading}
          note={recordRequestNote}
          onNote={setRecordRequestNote}
          onReview={reviewRecordRequest}
          onSearch={setRecordRequestSearch}
          onSelectRequest={setSelectedRecordRequestId}
          onStatusFilter={setRecordRequestStatusFilter}
          onReviewStatus={setRecordRequestReviewStatus}
          requests={filteredRecordRequests}
          reviewStatus={recordRequestReviewStatus}
          search={recordRequestSearch}
          selectedRequest={selectedRecordRequest}
          statusFilter={recordRequestStatusFilter}
          totalRequests={recordRequests}
        />
      );
    }
    if (activePage === "Verification Logs") {
      return (
        <VerificationLogsPage
          allLogs={verificationLogs}
          logs={filterVerificationLogsForTab(filteredVerificationLogs, activeWorkspaceTab)}
          onOutcomeFilter={setVerificationOutcomeFilter}
          onSearch={setVerificationSearch}
          outcomeFilter={verificationOutcomeFilter}
          search={verificationSearch}
        />
      );
    }
    if (activePage === "Background Jobs") {
      return <BackgroundJobsPage deadLetters={deadLetters} health={systemHealth} loading={loading} onRetryDeadLetterJob={retryDeadLetterJob} onRetryNotification={retryNotification} tab={activeWorkspaceTab} />;
    }
    if (activePage === "Revenue") {
      return <RevenuePage revenue={revenueOverview} />;
    }
    if (activePage === "Billing") {
      return <BillingPage revenue={revenueOverview} tab={activeWorkspaceTab} />;
    }
    if (activePage === "Reports") {
      return <ReportsPage auditEvents={auditEvents} revenue={revenueOverview} tab={activeWorkspaceTab} verificationLogs={verificationLogs} />;
    }
    if (activePage === "System Health") {
      return (
        <SystemHealthPage
          cleanupHours={rateLimitCleanupHours}
          deadLetters={deadLetters}
          health={systemHealth}
          idempotencyCleanupHours={idempotencyCleanupHours}
          loading={loading}
          onCleanupHours={setRateLimitCleanupHours}
          onIdempotencyCleanupHours={setIdempotencyCleanupHours}
          onQueueIdempotencyCleanup={queueIdempotencyCleanup}
          onQueueRateLimitCleanup={queueRateLimitCleanup}
          onRateLimitPolicyChange={setRateLimitPolicyForm}
          onCreateWebhookEndpoint={createWebhookEndpoint}
          onReplayWebhookDelivery={replayWebhookDelivery}
          onRetryWebhookDelivery={retryWebhookDelivery}
          onRotateWebhookEndpointSecret={rotateWebhookEndpointSecret}
          onSaveRateLimitPolicy={saveRateLimitPolicy}
          onRetryDeadLetterJob={retryDeadLetterJob}
          onRetryNotification={retryNotification}
          onUpdateWebhookEndpointForm={setWebhookEndpointForm}
          onUpdateWebhookEndpointStatus={updateWebhookEndpointStatus}
          rateLimitPolicy={rateLimitPolicy}
          rateLimitPolicyForm={rateLimitPolicyForm}
          selectedInstitutionId={selectedInstitutionId}
          webhookDeliveries={webhookDeliveries}
          webhookEndpointForm={webhookEndpointForm}
          webhookEndpoints={webhookEndpoints}
          webhookSecret={webhookSecret}
        />
      );
    }
    if (activePage === "Audit Logs") {
      return <AuditLogsPage auditEvents={auditEvents} tab={activeWorkspaceTab} />;
    }
    if (activePage === "Security") {
      return (
        <SecurityPage
          loading={loading}
          auditEvents={auditEvents}
          apiKeys={globalApiKeys}
          mfaEnabled={mfaEnabled}
          onEmergencyLockdown={emergencyLockdown}
          onEnableTotp={handleEnableTotp}
          onRotateRecoveryCodes={handleRotateRecoveryCodes}
          onSetupTotp={handleSetupTotp}
          recoveryCodeStatus={recoveryCodeStatus}
          recoveryRotateCode={recoveryRotateCode}
          setNewRecoveryCodes={setNewRecoveryCodes}
          setRecoveryRotateCode={setRecoveryRotateCode}
          setTotpEnableCode={setTotpEnableCode}
          newRecoveryCodes={newRecoveryCodes}
          totpEnableCode={totpEnableCode}
          totpSetup={totpSetup}
        />
      );
    }
    return <SettingsPage founderName={founderName} loading={loading} onSave={handleSaveSettings} settings={platformSettings} />;
  }
}

function OverviewPage({
  apiKeys,
  applications,
  dashboardSummary,
  institutions,
  metrics,
  onGenerateKey,
  onViewApplications,
  systemHealth
}: {
  apiKeys: GlobalApiKey[];
  applications: InstitutionApplication[];
  dashboardSummary: DashboardSummary | null;
  institutions: Institution[];
  metrics: { label: string; value: string | number; helper: string; tone: string; icon: string }[];
  onGenerateKey: () => void;
  onViewApplications: () => void;
  systemHealth: SystemHealth | null;
}) {
  const recentApplications = applications.slice(0, 5);
  const latestEvents = dashboardSummary?.latestAuditEvents ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <SectionTitle title="API Usage" subtitle="Last 7 days" />
            <button className={secondaryButtonClass} onClick={onGenerateKey} type="button">Generate API Key</button>
          </div>
          <LineChart data={dashboardSummary?.apiUsage ?? []} />
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Gateway Events", value: formatCompactNumber(dashboardSummary?.apiUsage.reduce((sum, item) => sum + item.total, 0) ?? 0) },
              { label: "Verification Events", value: formatCompactNumber(dashboardSummary?.apiUsage.reduce((sum, item) => sum + item.verification, 0) ?? 0) },
              { label: "Audit Events", value: formatCompactNumber(dashboardSummary?.apiUsage.reduce((sum, item) => sum + item.audit, 0) ?? 0) },
              { label: "Active API Keys", value: formatCompactNumber(dashboardSummary?.metrics.activeApiKeys ?? apiKeys.filter((key) => key.status === "ACTIVE").length) }
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-borderLight bg-white p-3">
                <p className="text-xs text-textSecondary">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-primary">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <SectionTitle title="Recent Institution Applications" subtitle="Founder approval queue" />
            <button className="text-sm font-medium text-accent" onClick={onViewApplications} type="button">View all</button>
          </div>
          <ListBlock
            empty="No institution applications yet."
            items={recentApplications.map((application) => ({
              id: application.uuid,
              title: application.officialName,
              meta: `${titleCase(application.type)} / ${application.state}`,
              status: titleCase(application.status),
              date: formatDate(application.createdAt)
            }))}
          />
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr_0.95fr]">
        <Card>
          <SectionTitle title="Institution Status Overview" subtitle="Partner distribution" />
          <DonutSummary status={dashboardSummary?.institutionStatus} fallbackTotal={institutions.length} />
        </Card>
        <Card>
          <SectionTitle title="Latest Audit Events" subtitle="Recent control-plane activity" />
          <ListBlock empty="No audit events recorded yet." items={latestEvents.map((event) => ({ id: event.id, title: event.label, meta: event.institutionName ?? event.actorName, status: event.outcome, date: formatDate(event.createdAt) }))} />
        </Card>
        <SystemHealthCompact health={systemHealth} />
      </div>
    </div>
  );
}

function InstitutionsPage(props: {
  apiKeys: GlobalApiKey[];
  auditEvents: AuditEvent[];
  developerRequests: DeveloperAccessRequest[];
  filteredInstitutions: Institution[];
  institutionForm: { officialName: string; type: string; state: string; tier: string };
  institutionSearch: string;
  institutionStateFilter: string;
    institutionStatusFilter: string;
    institutionStaff: InstitutionStaff[];
    institutionTierFilter: string;
    institutionTypeFilter: string;
    institutions: Institution[];
    loading: boolean;
    onCreateInstitution: (event: FormEvent<HTMLFormElement>) => void;
    onInviteStaff: (event: FormEvent<HTMLFormElement>) => void;
    onSelectInstitution: (id: string) => void;
    onStateFilter: (value: string) => void;
    onStatusFilter: (value: string) => void;
    onTierFilter: (value: string) => void;
    onTypeFilter: (value: string) => void;
    onUpdateStaff: (staffId: string, body: Record<string, unknown>) => void;
    onUpdateStaffInviteForm: (value: { fullName: string; email: string; phone: string; role: string; permissions: string; assignedScopes: string }) => void;
    onUpdateInstitutionForm: (value: { officialName: string; type: string; state: string; tier: string }) => void;
    onUpdateSearch: (value: string) => void;
    onUpdateStatus: (id: string, status: "ACTIVE" | "SUSPENDED") => void;
    selectedInstitution?: Institution;
    staffInviteForm: { fullName: string; email: string; phone: string; role: string; permissions: string; assignedScopes: string };
    staffLoading: boolean;
    verificationLogs: VerificationLog[];
  }) {
  const states = uniqueValues([...nigeriaStateOptions, ...props.institutions.map((institution) => institution.state)]);
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
      <Card>
        <SectionTitle title="Institutions" subtitle="Approved and active AcadID partners." />
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input className={`${inputClass} md:col-span-2`} placeholder="Search institutions" value={props.institutionSearch} onChange={(event) => props.onUpdateSearch(event.target.value)} />
          <FilterSelect value={props.institutionTypeFilter} onChange={props.onTypeFilter} options={["ALL", ...institutionCategoryOptions]} labels={institutionCategoryLabels} />
          <FilterSelect value={props.institutionStateFilter} onChange={props.onStateFilter} options={["ALL", ...states]} />
          <FilterSelect value={props.institutionStatusFilter} onChange={props.onStatusFilter} options={["ALL", "ACTIVE", "SUSPENDED"]} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <FilterSelect value={props.institutionTierFilter} onChange={props.onTierFilter} options={["ALL", "FOUNDING", "ACTIVE", "VERIFIED"]} />
          <div className="rounded-md border border-borderLight bg-soft px-3 py-2 text-sm text-textSecondary">
            Supported types: {institutionTypeOptions.join(", ")}
          </div>
        </div>
        <ResponsiveTable
          empty="No institutions match your search or filters."
          headers={["Institution", "Type", "State", "Tier", "Status", "Action"]}
          rows={props.filteredInstitutions.map((institution) => [
            <button key="name" className="text-left" onClick={() => props.onSelectInstitution(institution.uuid)} type="button">
              <p className="font-medium text-primary">{institution.officialName}</p>
              <p className="text-xs text-textSecondary">{institution.institutionId}</p>
            </button>,
            titleCase(institution.type),
            institution.state,
            titleCase(institution.tier),
            <StatusBadge key="status" status={institution.status} />,
            <button
              key="action"
              className={secondaryButtonClass}
              disabled={props.loading}
              onClick={() => props.onUpdateStatus(institution.uuid, institution.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")}
              type="button"
            >
              {institution.status === "ACTIVE" ? "Suspend" : "Reactivate"}
            </button>
          ])}
        />
      </Card>
      <div className="space-y-5">
        <Card>
          <SectionTitle title="Create Institution" subtitle="Manual founder-created partner record." />
          <form className="mt-4 space-y-3" onSubmit={props.onCreateInstitution}>
            <input className={inputClass} placeholder="Institution official name" value={props.institutionForm.officialName} onChange={(event) => props.onUpdateInstitutionForm({ ...props.institutionForm, officialName: event.target.value })} />
            <div className="grid gap-3 md:grid-cols-2">
              <FilterSelect value={props.institutionForm.type} onChange={(type) => props.onUpdateInstitutionForm({ ...props.institutionForm, type })} options={institutionCategoryOptions} labels={institutionCategoryLabels} />
              <FilterSelect value={props.institutionForm.state} onChange={(state) => props.onUpdateInstitutionForm({ ...props.institutionForm, state })} options={states} />
            </div>
            <FilterSelect value={props.institutionForm.tier} onChange={(tier) => props.onUpdateInstitutionForm({ ...props.institutionForm, tier })} options={["FOUNDING", "ACTIVE", "VERIFIED"]} />
            <button className={primaryButtonClass} disabled={props.loading}>Create Institution</button>
          </form>
        </Card>
          <InstitutionDetail
            apiKeys={props.apiKeys}
            auditEvents={props.auditEvents}
            developerRequests={props.developerRequests}
            institution={props.selectedInstitution}
            staff={props.institutionStaff}
            staffInviteForm={props.staffInviteForm}
            staffLoading={props.staffLoading}
            loading={props.loading}
            onInviteStaff={props.onInviteStaff}
            onUpdateStaff={props.onUpdateStaff}
            onUpdateStaffInviteForm={props.onUpdateStaffInviteForm}
            verificationLogs={props.verificationLogs}
          />
        </div>
      </div>
  );
}

function AcademicOperationsPage({
  invitationLeads,
  loading,
  onUpdateInvitationLead,
  operations,
  onViewHealth
}: {
  invitationLeads: InvitationLead[];
  loading: boolean;
  onUpdateInvitationLead: (id: string, status: InvitationLeadStatus) => void;
  operations: AcademicOperations | null;
  onViewHealth: () => void;
}) {
  const metrics = operations?.metrics;
  const institutionHealth = operations?.institutionHealth ?? [];
  const atRiskInstitutions = institutionHealth.filter((institution) => institution.flags.length > 0).slice(0, 12);
  const activeInvitationLeads = invitationLeads.filter((lead) => !["CONVERTED", "DISMISSED"].includes(lead.status));
  const completionAverage = institutionHealth.length
    ? Math.round(institutionHealth.reduce((sum, institution) => sum + institution.completionScore, 0) / institutionHealth.length)
    : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Active Sessions" value={metrics?.activeSessions ?? "--"} helper="Open academic periods" tone="success" icon="Academic Operations" />
        <MetricCard label="Structure Nodes" value={metrics?.structureNodes ?? "--"} helper="Classes, subjects, departments, courses" tone="accent" icon="Institutions" />
        <MetricCard label="Setup Gaps" value={(metrics?.institutionsMissingGradingRules ?? 0) + (metrics?.institutionsMissingSubjectsOrCourses ?? 0)} helper="Grading and subject/course gaps" tone={(metrics?.institutionsMissingGradingRules || metrics?.institutionsMissingSubjectsOrCourses) ? "warning" : "success"} icon="Settings" />
        <MetricCard label="Pending Rollovers" value={metrics?.pendingRollovers ?? "--"} helper="Manual progression queue" tone={metrics?.pendingRollovers ? "warning" : "success"} icon="Record Requests" />
        <MetricCard label="Transfer Alerts" value={(metrics?.requestedTransfers ?? 0) + (metrics?.disputedTransfers ?? 0)} helper="Requested or disputed transfers" tone={(metrics?.requestedTransfers || metrics?.disputedTransfers) ? "warning" : "success"} icon="Disputes" />
        <MetricCard label="Sealed Sessions" value={metrics?.sealedSessions ?? "--"} helper="Locked academic periods" tone={metrics?.sealedSessions ? "warning" : "accent"} icon="Security" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <MetricLine label="Missing grading rules" value={String(metrics?.institutionsMissingGradingRules ?? 0)} />
        </Card>
        <Card>
          <MetricLine label="Missing subjects/courses" value={String(metrics?.institutionsMissingSubjectsOrCourses ?? 0)} />
        </Card>
        <Card>
          <MetricLine label="Unscoped staff institutions" value={String(metrics?.institutionsWithUnscopedStaff ?? 0)} />
        </Card>
        <Card>
          <MetricLine label="Validation jobs needing attention" value={String(metrics?.institutionsWithValidationBacklog ?? 0)} />
        </Card>
        <Card>
          <MetricLine label="Tracked storage objects" value={String(metrics?.storageObjects ?? 0)} />
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <SectionTitle title="Invitation Leads" subtitle="Unregistered institutions graduates are requesting records from." />
          <StatusBadge status={`${activeInvitationLeads.length} Active`} />
        </div>
        <ResponsiveTable
          empty="No unregistered institution demand has been captured yet."
          headers={["Institution", "Demand", "Latest Request", "Status", "Last Activity", "Actions"]}
          rows={invitationLeads.slice(0, 12).map((lead) => [
            <div key="institution">
              <p className="font-medium text-primary">{lead.institutionName}</p>
              <p className="text-xs text-textSecondary">{lead.educationLevel ?? "Education level pending"}{lead.stateHint ? ` / ${lead.stateHint}` : ""}</p>
            </div>,
            <div key="demand">
              <p className="font-medium text-primary">{lead.demandCount.toLocaleString()} request{lead.demandCount === 1 ? "" : "s"}</p>
              <p className="text-xs text-textSecondary">{lead.requesterCount.toLocaleString()} requester signal{lead.requesterCount === 1 ? "" : "s"}</p>
            </div>,
            <span key="request" className="font-mono text-xs text-primary">{lead.latestRecordRequestCode ?? "No request code"}</span>,
            <StatusBadge key="status" status={lead.status} />,
            formatDate(lead.lastRequestedAt),
            <div key="actions" className="flex flex-wrap gap-2">
              <button className={secondaryButtonClass} disabled={loading || lead.status === "CONTACTED"} onClick={() => onUpdateInvitationLead(lead.uuid, "CONTACTED")} type="button">Contacted</button>
              <button className={primarySmallButtonClass} disabled={loading || lead.status === "INVITED"} onClick={() => onUpdateInvitationLead(lead.uuid, "INVITED")} type="button">Invited</button>
              <button className={secondaryButtonClass} disabled={loading || lead.status === "DISMISSED"} onClick={() => onUpdateInvitationLead(lead.uuid, "DISMISSED")} type="button">Dismiss</button>
            </div>
          ])}
        />
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SectionTitle title="Institution Academic Health" subtitle={operations ? `Updated ${formatDate(operations.generatedAt)}` : "Waiting for Data Center summary."} />
            <button className={secondaryButtonClass} onClick={onViewHealth} type="button">View System Health</button>
          </div>
          <ResponsiveTable
            empty="No institution academic health data yet."
            headers={["Institution", "Setup", "Sessions", "Structure", "Rules", "Staff", "Jobs", "Storage", "Flags"]}
            rows={institutionHealth.map((institution) => [
              <div key="institution"><p className="font-medium text-primary">{institution.institutionName}</p><p className="text-xs text-textSecondary">{institution.institutionId} / {institution.state}</p></div>,
              <StatusBadge key="setup" status={`${institution.completionScore}% Ready`} />,
              `${institution.activeSessions} active / ${institution.sealedSessions} sealed`,
              `${institution.structureNodes.toLocaleString()} nodes / ${(institution.subjectCourseNodes ?? 0).toLocaleString()} subjects-courses`,
              `${institution.activeGradingRules ?? 0} active`,
              `${institution.scopedStaff ?? 0} scoped / ${institution.unscopedStaff ?? 0} unscoped`,
              `${institution.validationJobsAttention ?? 0} attention`,
              `${institution.storageObjects ?? 0} objects`,
              institution.flags.length ? institution.flags.slice(0, 3).join(", ") : "Clear"
            ])}
          />
        </Card>

        <div className="space-y-5">
          <Card>
            <SectionTitle title="Setup Readiness" subtitle="Academic operations completion across institutions." />
            <div className="mt-4 grid gap-3">
              <MetricLine label="Average setup completion" value={`${completionAverage}%`} />
              <MetricLine label="Published result batches" value={String(metrics?.publishedBatches ?? "--")} />
              <MetricLine label="Rejected result batches" value={String(metrics?.rejectedBatches ?? "--")} />
              <MetricLine label="Reopen escalations" value={String(metrics?.reopenEscalations ?? "--")} />
              <MetricLine label="Slow validation jobs" value={String(metrics?.slowValidationJobs ?? 0)} />
              <MetricLine label="Failed validation jobs" value={String(metrics?.failedValidationJobs ?? 0)} />
            </div>
          </Card>
          <Card>
            <SectionTitle title="Structure Mix" subtitle="Institution-defined academic tree." />
            <ListBlock
              empty="No academic structures have been configured yet."
              items={(operations?.structureTypes ?? []).slice(0, 8).map((item) => ({
                title: titleCase(item.type),
                meta: `${item.count.toLocaleString()} node${item.count === 1 ? "" : "s"}`,
                status: "Configured"
              }))}
            />
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <SectionTitle title="Recent Rollovers" subtitle="Manual learner progression decisions." />
          <ResponsiveTable
            empty="No rollover records have been created yet."
            headers={["Learner", "Institution", "Decision", "From", "To", "Status"]}
            rows={(operations?.recentRollovers ?? []).map((rollover) => [
              <div key="learner"><p className="font-medium text-primary">{rollover.learnerName}</p><p className="text-xs text-textSecondary">{rollover.learnerAin}</p></div>,
              rollover.institutionName,
              titleCase(rollover.decision),
              <div key="from"><p>{rollover.fromSession}</p><p className="text-xs text-textSecondary">{rollover.fromStructure}</p></div>,
              <div key="to"><p>{rollover.toSession}</p><p className="text-xs text-textSecondary">{rollover.toStructure}</p></div>,
              <StatusBadge key="status" status={rollover.status} />
            ])}
          />
        </Card>
        <Card>
          <SectionTitle title="Recent Transfers" subtitle="Durable transfer requests and transfer-out decisions." />
          <ResponsiveTable
            empty="No transfer requests have been created yet."
            headers={["Transfer", "Learner", "From", "To", "Status"]}
            rows={(operations?.recentTransfers ?? []).map((transfer) => [
              <span key="transfer" className="font-mono text-xs text-primary">{transfer.transferId}</span>,
              <div key="learner"><p className="font-medium text-primary">{transfer.learnerName}</p><p className="text-xs text-textSecondary">{transfer.learnerAin}</p></div>,
              transfer.fromInstitutionName,
              transfer.toInstitutionName ?? "External destination",
              <StatusBadge key="status" status={transfer.status} />
            ])}
          />
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <SectionTitle title="Disputed Rollovers" subtitle="Rollover and transfer disputes that affect academic history." />
          <ResponsiveTable
            empty="No disputed rollover records."
            headers={["Learner", "Institution", "Decision", "Transfer", "Dispute"]}
            rows={(operations?.disputedRollovers ?? []).map((rollover) => [
              <div key="learner"><p className="font-medium text-primary">{rollover.learnerName}</p><p className="text-xs text-textSecondary">{rollover.learnerAin}</p></div>,
              rollover.institutionName,
              titleCase(rollover.decision),
              rollover.transferId ?? "No transfer link",
              <div key="dispute"><StatusBadge status={rollover.disputeStatus ?? "Open"} /><p className="mt-1 text-xs text-textSecondary">{rollover.disputeTitle ?? "Dispute title pending"}</p></div>
            ])}
          />
        </Card>
        <Card>
          <SectionTitle title="Sealed Session Escalations" subtitle="Audited requests to reopen locked periods." />
          <ResponsiveTable
            empty="No sealed-session reopen escalations recorded."
            headers={["Action", "Institution", "Reason", "Actor", "When"]}
            rows={(operations?.sealedSessionEscalations ?? []).map((event) => [
              event.label,
              event.institutionName ?? event.institutionId ?? "No institution",
              event.reason ?? "No reason recorded",
              event.actorName,
              formatDate(event.createdAt)
            ])}
          />
        </Card>
      </div>

      <Card>
        <SectionTitle title="Institutions Needing Attention" subtitle="Academic setup, rollover, and sealed-session signals." />
        <ResponsiveTable
          empty="No academic operations issues detected."
          headers={["Institution", "Status", "Completion", "Primary Flags", "Batches"]}
          rows={atRiskInstitutions.map((institution) => [
            <div key="institution"><p className="font-medium text-primary">{institution.institutionName}</p><p className="text-xs text-textSecondary">{institution.institutionId}</p></div>,
            <StatusBadge key="status" status={institution.status} />,
            `${institution.completionScore}%`,
            institution.flags.join(", "),
            `${institution.publishedBatches} published / ${institution.rejectedBatches} rejected`
          ])}
        />
      </Card>
    </div>
  );
}

function ApplicationsPage(props: {
  applicationSearch: string;
  applicationStatusFilter: string;
  applications: InstitutionApplication[];
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRequestInfo: (id: string) => void;
  onSendEmail: (id: string) => void;
  onSelectApplication: (id: string) => void;
  onStatusFilter: (value: string) => void;
  onUpdateSearch: (value: string) => void;
  selectedApplication?: InstitutionApplication;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_0.85fr]">
      <Card>
        <SectionTitle title="Institution Applications" subtitle="Schools registered through Institution Portal." />
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
          <input className={inputClass} placeholder="Search applications" value={props.applicationSearch} onChange={(event) => props.onUpdateSearch(event.target.value)} />
          <FilterSelect value={props.applicationStatusFilter} onChange={props.onStatusFilter} options={["ALL", "PENDING", "APPROVED", "REJECTED"]} />
        </div>
        <ResponsiveTable
          empty="No institution applications match your filters."
          headers={["Institution", "Contact", "Volume", "Status", "Submitted", "Action"]}
          rows={props.applications.map((application) => [
            <button key="name" className="text-left" onClick={() => props.onSelectApplication(application.uuid)} type="button">
              <p className="font-medium text-primary">{application.officialName}</p>
              <p className="text-xs text-textSecondary">{titleCase(application.type)} / {application.state}</p>
            </button>,
            <div key="contact"><p>{application.contactPersonName}</p><p className="text-xs text-textSecondary">{application.contactEmail}</p></div>,
            application.studentVolume.toLocaleString(),
            <StatusBadge key="status" status={application.status} />,
            formatDate(application.createdAt),
            <div key="actions" className="flex gap-2">
              <button className={primarySmallButtonClass} disabled={application.status !== "PENDING" || props.loading} onClick={() => props.onApprove(application.uuid)} type="button">Approve</button>
              <button className={secondaryButtonClass} disabled={application.status !== "PENDING" || props.loading} onClick={() => props.onReject(application.uuid)} type="button">Reject</button>
            </div>
          ])}
        />
      </Card>
      <ApplicationDetail application={props.selectedApplication} onApprove={props.onApprove} onReject={props.onReject} onRequestInfo={props.onRequestInfo} onSendEmail={props.onSendEmail} loading={props.loading} />
    </div>
  );
}

function ApiKeysPage(props: {
  apiKeyOwnerFilter: string;
  apiKeySearch: string;
  apiKeyStatusFilter: string;
  approvedDeveloperInstitutions: Institution[];
  filteredApiKeys: GlobalApiKey[];
  institutionApiKeys: GlobalApiKey[];
  institutionKeyForm: { label: string; environment: "SANDBOX" | "PRODUCTION"; rateLimitPerMinute: number; scopes: string[] };
  institutions: Institution[];
  loading: boolean;
  onCreateInstitutionKey: (event: FormEvent<HTMLFormElement>) => void;
  onCreateProductKey: (event: FormEvent<HTMLFormElement>) => void;
  onOwnerFilter: (value: string) => void;
  onRegenerate: (id: string) => void;
  onRevoke: (id: string) => void;
  onSelectInstitution: (id: string) => void;
  onStatusFilter: (value: string) => void;
  onToggleInstitutionScope: (scope: string) => void;
  onToggleProductScope: (scope: string) => void;
  onUpdateInstitutionKeyForm: (value: { label: string; environment: "SANDBOX" | "PRODUCTION"; rateLimitPerMinute: number; scopes: string[] }) => void;
  onUpdateProductKeyForm: (value: { productCode: string; productName: string; label: string; environment: "SANDBOX" | "PRODUCTION"; rateLimitPerMinute: number; scopes: string[] }) => void;
  onUpdateSearch: (value: string) => void;
  productApiKeys: GlobalApiKey[];
  productKeyForm: { productCode: string; productName: string; label: string; environment: "SANDBOX" | "PRODUCTION"; rateLimitPerMinute: number; scopes: string[] };
  selectedInstitutionId: string;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ProductApiKeyForm {...props} />
        <InstitutionApiKeyForm {...props} />
      </div>
      <Card>
        <SectionTitle title="API Key Registry" subtitle="Product keys and approved institution Live Results keys." />
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input className={`${inputClass} md:col-span-2`} placeholder="Search API keys" value={props.apiKeySearch} onChange={(event) => props.onUpdateSearch(event.target.value)} />
          <FilterSelect value={props.apiKeyOwnerFilter} onChange={props.onOwnerFilter} options={["ALL", "PRODUCT", "INSTITUTION"]} />
          <FilterSelect value={props.apiKeyStatusFilter} onChange={props.onStatusFilter} options={["ALL", "ACTIVE", "REVOKED", "EXPIRED"]} />
        </div>
        <ResponsiveTable
          empty="No API keys match your search or filters."
          headers={["Key", "Owner", "Environment", "Scopes", "Rate", "Last Used", "Status", "Action"]}
          rows={props.filteredApiKeys.map((apiKey) => [
            <div key="key"><p className="font-medium text-primary">{apiKey.label}</p><p className="font-mono text-xs text-textSecondary">{apiKey.clientId}</p></div>,
            <div key="owner"><p>{apiKey.ownerLabel ?? "Unassigned"}</p><p className="text-xs text-textSecondary">{apiKey.ownerType} / {apiKey.ownerReference ?? "No reference"}</p></div>,
            titleCase(apiKey.environment),
            <span key="scopes" className="text-xs">{apiKey.scopes.join(", ")}</span>,
            `${apiKey.rateLimitPerMinute}/min`,
            apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "Never",
            <StatusBadge key="status" status={apiKey.status} />,
            <div key="actions" className="flex gap-2">
              <button className={secondaryButtonClass} disabled={props.loading} onClick={() => props.onRegenerate(apiKey.uuid)} type="button">Regenerate</button>
              <button className={secondaryButtonClass} disabled={apiKey.status !== "ACTIVE" || props.loading} onClick={() => props.onRevoke(apiKey.uuid)} type="button">Revoke</button>
            </div>
          ])}
        />
      </Card>
    </div>
  );
}

function ProductApiKeyForm(props: Parameters<typeof ApiKeysPage>[0]) {
  const selectedProduct = getProductOption(props.productKeyForm.productCode);
  const productLabels = Object.fromEntries(productOptions.map((product) => [product.code, product.name]));
  return (
    <Card>
      <SectionTitle title="Internal Product API Keys" subtitle="Founder-generated keys for ACAD.ID-owned products." />
      <form className="mt-4 space-y-3" onSubmit={props.onCreateProductKey}>
        <FilterSelect
          value={props.productKeyForm.productCode}
          onChange={(code) => {
            const product = getProductOption(code);
            props.onUpdateProductKeyForm({
              ...props.productKeyForm,
              productCode: product.code,
              productName: product.name,
              label: `${product.name} Backend - ${titleCase(props.productKeyForm.environment)}`,
              rateLimitPerMinute: product.rateLimitPerMinute,
              scopes: product.recommendedScopes
            });
          }}
          options={productOptions.map((product) => product.code)}
          labels={productLabels}
        />
        <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary">Recommended for {selectedProduct.name}</p>
              <p className="mt-1 text-xs leading-5 text-textSecondary">{selectedProduct.description}</p>
            </div>
            <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">Auto-selected</span>
          </div>
          <p className="mt-3 text-xs text-textSecondary">Recommended scopes: {selectedProduct.recommendedScopes.join(", ")}</p>
        </div>
        <input className={inputClass} value={props.productKeyForm.label} onChange={(event) => props.onUpdateProductKeyForm({ ...props.productKeyForm, label: event.target.value })} />
        <div className="grid gap-3 md:grid-cols-2">
          <FilterSelect value={props.productKeyForm.environment} onChange={(environment) => props.onUpdateProductKeyForm({ ...props.productKeyForm, environment: environment as "SANDBOX" | "PRODUCTION" })} options={["SANDBOX", "PRODUCTION"]} />
          <input className={inputClass} type="number" min={1} max={10000} value={props.productKeyForm.rateLimitPerMinute} onChange={(event) => props.onUpdateProductKeyForm({ ...props.productKeyForm, rateLimitPerMinute: Number(event.target.value) })} />
        </div>
        <ScopePicker selected={props.productKeyForm.scopes} onToggle={props.onToggleProductScope} recommendedScopes={selectedProduct.recommendedScopes} />
        <button className={primaryButtonClass} disabled={props.loading}>Generate Product API Key</button>
      </form>
    </Card>
  );
}

function InstitutionApiKeyForm(props: Parameters<typeof ApiKeysPage>[0]) {
  const selectedInstitutionId = props.approvedDeveloperInstitutions.some((institution) => institution.uuid === props.selectedInstitutionId)
    ? props.selectedInstitutionId
    : "";
  return (
    <Card>
      <SectionTitle title="Institution Live Results API Keys" subtitle="Only for institutions approved for Developer Access." />
      <form className="mt-4 space-y-3" onSubmit={props.onCreateInstitutionKey}>
        <FilterSelect value={selectedInstitutionId} onChange={props.onSelectInstitution} options={["", ...props.approvedDeveloperInstitutions.map((institution) => institution.uuid)]} labels={{ "": "Select approved institution", ...Object.fromEntries(props.approvedDeveloperInstitutions.map((institution) => [institution.uuid, institution.officialName])) }} />
        <input className={inputClass} value={props.institutionKeyForm.label} onChange={(event) => props.onUpdateInstitutionKeyForm({ ...props.institutionKeyForm, label: event.target.value })} />
        <div className="grid gap-3 md:grid-cols-2">
          <FilterSelect value={props.institutionKeyForm.environment} onChange={(environment) => props.onUpdateInstitutionKeyForm({ ...props.institutionKeyForm, environment: environment as "SANDBOX" | "PRODUCTION" })} options={["SANDBOX", "PRODUCTION"]} />
          <input className={inputClass} type="number" min={1} max={10000} value={props.institutionKeyForm.rateLimitPerMinute} onChange={(event) => props.onUpdateInstitutionKeyForm({ ...props.institutionKeyForm, rateLimitPerMinute: Number(event.target.value) })} />
        </div>
        <ScopePicker selected={props.institutionKeyForm.scopes} onToggle={props.onToggleInstitutionScope} recommendedScopes={["ingest:write", "govern:write", "verify:read"]} />
        <button className={primaryButtonClass} disabled={props.loading || !selectedInstitutionId}>Generate Institution Key</button>
        {!props.approvedDeveloperInstitutions.length ? <EmptyState text="No institution has approved developer access yet." /> : null}
      </form>
    </Card>
  );
}

function DeveloperRequestsPage({
  loading,
  onStatusFilter,
  onUpdate,
  requests,
  statusFilter
}: {
  loading: boolean;
  onStatusFilter: (value: string) => void;
  onUpdate: (id: string, action: "approve" | "reject" | "suspend") => void;
  requests: DeveloperAccessRequest[];
  statusFilter: string;
}) {
  return (
    <Card>
      <SectionTitle title="Developer Access Requests" subtitle="Schools requesting Live Results API activation." />
      <div className="mt-4 max-w-xs"><FilterSelect value={statusFilter} onChange={onStatusFilter} options={["ALL", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"]} /></div>
      <ResponsiveTable
        empty="No developer access requests yet."
        headers={["Institution", "Reason", "Developer", "Scopes", "Status", "Action"]}
        rows={requests.map((request) => [
          request.institution.officialName,
          request.reason,
          `${request.developerName} / ${request.developerEmail}`,
          request.requestedScopes.join(", "),
          <StatusBadge key="status" status={request.status} />,
          <div key="actions" className="flex gap-2">
            <button className={primarySmallButtonClass} disabled={loading || request.status !== "PENDING"} onClick={() => onUpdate(request.uuid, "approve")} type="button">Approve</button>
            <button className={secondaryButtonClass} disabled={loading || request.status !== "PENDING"} onClick={() => onUpdate(request.uuid, "reject")} type="button">Reject</button>
            <button className={secondaryButtonClass} disabled={loading || request.status !== "APPROVED"} onClick={() => onUpdate(request.uuid, "suspend")} type="button">Suspend</button>
          </div>
        ])}
      />
    </Card>
  );
}

function DisputesPage({
  disputes,
  loading,
  noticeText,
  onAssign,
  onClose,
  onEscalate,
  onNoticeText,
  onResolutionNote,
  onSelectDispute,
  onSendNotice,
  onStatusFilter,
  resolutionNote,
  selectedDispute,
  statusFilter
}: {
  disputes: Dispute[];
  loading: boolean;
  noticeText: string;
  onAssign: (id: string) => void;
  onClose: (id: string) => void;
  onEscalate: (id: string) => void;
  onNoticeText: (value: string) => void;
  onResolutionNote: (value: string) => void;
  onSelectDispute: (id: string) => void;
  onSendNotice: (id: string) => void;
  onStatusFilter: (value: string) => void;
  resolutionNote: string;
  selectedDispute: Dispute | null;
  statusFilter: string;
}) {
  const openCount = disputes.filter((dispute) => dispute.status === "OPEN").length;
  const escalatedCount = disputes.filter((dispute) => dispute.status === "ESCALATED").length;
  const selectedCanAct = selectedDispute && selectedDispute.status !== "RESOLVED";

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
      <Card>
        <SectionTitle title="Disputes" subtitle="Learner and institution dispute operations." />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <MetricLine label="Open" value={String(openCount)} />
          <MetricLine label="Escalated" value={String(escalatedCount)} />
          <MetricLine label="Filtered" value={String(disputes.length)} />
        </div>
        <div className="mt-4 max-w-xs"><FilterSelect value={statusFilter} onChange={onStatusFilter} options={["ALL", "OPEN", "RESOLVED", "ESCALATED"]} /></div>
        <ResponsiveTable
          empty="No disputes match this filter yet."
          headers={["Dispute", "Institution", "Priority", "Status", "Created", "Action"]}
          rows={disputes.map((dispute) => [
            <div key="title">
              <p className="font-medium text-primary">{dispute.title}</p>
              <p className="text-xs text-textSecondary">{dispute.category}</p>
            </div>,
            dispute.institution?.officialName ?? "Unlinked",
            <StatusBadge key="priority" status={dispute.priority} />,
            <StatusBadge key="status" status={dispute.status} />,
            formatDate(dispute.createdAt),
            <button key="action" className={secondaryButtonClass} onClick={() => onSelectDispute(dispute.uuid)} type="button">View details</button>
          ])}
        />
      </Card>
      <Card>
        <SectionTitle title="Dispute Detail" subtitle="Assign, notify institution, escalate, or close." />
        {selectedDispute ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-borderLight bg-soft p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">{selectedDispute.title}</p>
                  <p className="mt-1 text-xs text-textSecondary">{selectedDispute.institution?.officialName ?? "No institution linked"}{selectedDispute.learner ? ` / ${selectedDispute.learner.ain}` : ""}</p>
                </div>
                <StatusBadge status={selectedDispute.status} />
              </div>
              <p className="mt-3 text-sm leading-6 text-textSecondary">{selectedDispute.description}</p>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <MetricLine label="Assigned to" value={selectedDispute.assignedTo?.fullName ?? "Unassigned"} />
                <MetricLine label="Credential" value={selectedDispute.credential?.credentialRef ?? "Not linked"} />
                <MetricLine label="Notice sent" value={selectedDispute.noticeSentAt ? formatDate(selectedDispute.noticeSentAt) : "Not sent"} />
                <MetricLine label="Resolved" value={selectedDispute.resolvedAt ? formatDate(selectedDispute.resolvedAt) : "Open"} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button className={primarySmallButtonClass} disabled={loading || !selectedCanAct} onClick={() => onAssign(selectedDispute.uuid)} type="button">Assign to founder</button>
              <button className={secondaryButtonClass} disabled={loading || !selectedCanAct} onClick={() => onEscalate(selectedDispute.uuid)} type="button">Escalate</button>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-textSecondary">Institution notice</label>
              <textarea className={`${inputClass} mt-2 min-h-24`} value={noticeText} onChange={(event) => onNoticeText(event.target.value)} />
              <button className={`${secondaryButtonClass} mt-3`} disabled={loading || !selectedCanAct || noticeText.trim().length < 10} onClick={() => onSendNotice(selectedDispute.uuid)} type="button">Send notice to institution</button>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-textSecondary">Resolution note</label>
              <textarea className={`${inputClass} mt-2 min-h-24`} placeholder="Explain the final resolution before closing the dispute." value={resolutionNote} onChange={(event) => onResolutionNote(event.target.value)} />
              <button className={`${primarySmallButtonClass} mt-3`} disabled={loading || !selectedCanAct || resolutionNote.trim().length < 10} onClick={() => onClose(selectedDispute.uuid)} type="button">Close dispute</button>
            </div>
          </div>
        ) : (
          <EmptyState text="Select a dispute to review its details." />
        )}
      </Card>
    </div>
  );
}

function RecordRequestsPage({
  loading,
  note,
  onNote,
  onReview,
  onReviewStatus,
  onSearch,
  onSelectRequest,
  onStatusFilter,
  requests,
  reviewStatus,
  search,
  selectedRequest,
  statusFilter,
  totalRequests
}: {
  loading: boolean;
  note: string;
  onNote: (value: string) => void;
  onReview: (id: string, status: RecordRequestStatus) => void;
  onReviewStatus: (value: RecordRequestStatus) => void;
  onSearch: (value: string) => void;
  onSelectRequest: (id: string) => void;
  onStatusFilter: (value: string) => void;
  requests: RecordRequest[];
  reviewStatus: RecordRequestStatus;
  search: string;
  selectedRequest: RecordRequest | null;
  statusFilter: string;
  totalRequests: RecordRequest[];
}) {
  const openCount = totalRequests.filter((request) => ["SUBMITTED", "AWAITING_PAYMENT", "ASSIGNED", "INSTITUTION_REVIEW", "NEEDS_MORE_INFORMATION"].includes(request.status)).length;
  const escalatedCount = totalRequests.filter((request) => request.status === "ESCALATED").length;
  const fulfilledCount = totalRequests.filter((request) => request.status === "FULFILLED").length;
  const canReview = selectedRequest && !["FULFILLED", "CANCELLED"].includes(selectedRequest.status);
  const statusOptions: RecordRequestStatus[] = [
    "ASSIGNED",
    "INSTITUTION_REVIEW",
    "NEEDS_MORE_INFORMATION",
    "APPROVED",
    "REJECTED",
    "FULFILLED",
    "DISPUTED",
    "ESCALATED",
    "CANCELLED"
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.82fr]">
      <Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <SectionTitle title="Record Requests" subtitle="Graduate and learner requests for old records, archive recovery, and institution follow-up." />
          <div className="grid gap-2 text-sm sm:grid-cols-3 md:min-w-[360px]">
            <MetricLine label="Open" value={String(openCount)} />
            <MetricLine label="Escalated" value={String(escalatedCount)} />
            <MetricLine label="Fulfilled" value={String(fulfilledCount)} />
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <input className={inputClass} placeholder="Search request ID, AIN, learner, institution, student number..." value={search} onChange={(event) => onSearch(event.target.value)} />
          <FilterSelect
            value={statusFilter}
            onChange={onStatusFilter}
            options={["ALL", "SUBMITTED", "AWAITING_PAYMENT", "ASSIGNED", "INSTITUTION_REVIEW", "NEEDS_MORE_INFORMATION", "APPROVED", "REJECTED", "FULFILLED", "DISPUTED", "ESCALATED", "CANCELLED"]}
          />
        </div>
        <ResponsiveTable
          empty="No record requests match this search or status filter."
          headers={["Request", "Learner", "Institution", "Records", "Status", "Submitted", "Action"]}
          rows={requests.map((request) => [
            <div key="request">
              <p className="font-mono text-xs font-semibold text-primary">{request.requestId}</p>
              <p className="text-xs text-textSecondary">{request.educationLevel}{formatYears(request) ? ` / ${formatYears(request)}` : ""}</p>
            </div>,
            <div key="learner">
              <p className="font-medium text-primary">{request.learner?.fullName ?? request.requesterName ?? "Unlinked learner"}</p>
              <p className="text-xs text-textSecondary">{request.learner?.ain ?? request.requesterEmail ?? "No AIN yet"}</p>
            </div>,
            <div key="institution">
              <p>{request.institution?.officialName ?? request.institutionNameSubmitted}</p>
              <p className="text-xs text-textSecondary">{request.institution?.institutionId ?? "Submitted by learner"}{request.studentNumber ? ` / ${request.studentNumber}` : ""}</p>
            </div>,
            <span key="types" className="text-xs">{request.recordTypesRequested.join(", ")}</span>,
            <StatusBadge key="status" status={request.status} />,
            formatDate(request.submittedAt),
            <button key="action" className={secondaryButtonClass} onClick={() => onSelectRequest(request.uuid)} type="button">Review</button>
          ])}
        />
      </Card>
      <Card>
        <SectionTitle title="Request Detail" subtitle="Review learner proof, institution context, and move the request through governance." />
        {selectedRequest ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-borderLight bg-soft p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-primary">{selectedRequest.requestId}</p>
                  <p className="mt-1 text-xs text-textSecondary">{selectedRequest.learner?.fullName ?? selectedRequest.requesterName ?? "Unlinked learner"}{selectedRequest.learner?.ain ? ` / ${selectedRequest.learner.ain}` : ""}</p>
                </div>
                <StatusBadge status={selectedRequest.status} />
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <MetricLine label="Institution" value={selectedRequest.institution?.officialName ?? selectedRequest.institutionNameSubmitted} />
                <MetricLine label="Education level" value={selectedRequest.educationLevel} />
                <MetricLine label="Years attended" value={formatYears(selectedRequest) || "Not provided"} />
                <MetricLine label="Student number" value={selectedRequest.studentNumber ?? "Not provided"} />
                <MetricLine label="Department/class" value={selectedRequest.departmentOrClass ?? "Not provided"} />
                <MetricLine label="Payment" value={titleCase(selectedRequest.paymentStatus)} />
                <MetricLine label="Assigned to" value={selectedRequest.assignedTo?.fullName ?? "Unassigned"} />
                <MetricLine label="Proof documents" value={String(selectedRequest.proofDocumentUrls.length)} />
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase text-textSecondary">Requested records</p>
                <p className="mt-1 text-sm text-primary">{selectedRequest.recordTypesRequested.join(", ")}</p>
              </div>
              {selectedRequest.rejectionReason || selectedRequest.escalationReason || selectedRequest.resolutionNote ? (
                <div className="mt-4 rounded-md border border-borderLight bg-white p-3 text-sm text-textSecondary">
                  {selectedRequest.rejectionReason ? <p><span className="font-medium text-primary">Rejection:</span> {selectedRequest.rejectionReason}</p> : null}
                  {selectedRequest.escalationReason ? <p><span className="font-medium text-primary">Escalation:</span> {selectedRequest.escalationReason}</p> : null}
                  {selectedRequest.resolutionNote ? <p><span className="font-medium text-primary">Resolution:</span> {selectedRequest.resolutionNote}</p> : null}
                </div>
              ) : null}
            </div>
            <div className="grid gap-3">
              <Field label="Next status">
                <FilterSelect value={reviewStatus} onChange={(value) => onReviewStatus(value as RecordRequestStatus)} options={statusOptions} />
              </Field>
              <Field label="Founder note">
                <textarea className={`${inputClass} min-h-24 py-2`} value={note} onChange={(event) => onNote(event.target.value)} />
              </Field>
              <button className={primaryButtonClass} disabled={loading || !canReview} onClick={() => onReview(selectedRequest.uuid, reviewStatus)} type="button">
                Update Record Request
              </button>
            </div>
          </div>
        ) : (
          <EmptyState text="Select a record request to review its details." />
        )}
      </Card>
    </div>
  );
}

function VerificationLogsPage({
  allLogs,
  logs,
  onOutcomeFilter,
  onSearch,
  outcomeFilter,
  search
}: {
  allLogs: VerificationLog[];
  logs: VerificationLog[];
  onOutcomeFilter: (value: string) => void;
  onSearch: (value: string) => void;
  outcomeFilter: string;
  search: string;
}) {
  const confirmed = allLogs.filter((log) => log.outcome === "CONFIRMED").length;
  const denied = allLogs.filter((log) => log.outcome === "DENIED").length;
  const riskEvents = allLogs.filter((log) => ["DISCREPANCY", "REVOKED"].includes(log.outcome)).length;

  function exportCsv() {
    const headers = ["AIN", "Learner", "Institution", "Verifier", "Verifier Type", "Credential", "Outcome", "Scope", "Verified At"];
    const rows = logs.map((log) => [
      log.ain,
      log.learnerName,
      log.institutionName,
      log.verifier,
      log.verifierType,
      log.credential,
      log.outcome,
      log.scopeShown,
      log.verifiedAt
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll("\"", "\"\"")}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `acadid-verification-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Verification Events" value={allLogs.length} helper="Last 500 events" tone="accent" icon="Verification Logs" />
        <MetricCard label="Confirmed" value={confirmed} helper="Successful checks" tone="success" icon="Verification Logs" />
        <MetricCard label="Denied" value={denied} helper="Blocked or invalid access" tone="warning" icon="Verification Logs" />
        <MetricCard label="Risk Events" value={riskEvents} helper="Discrepancy or revoked" tone="error" icon="Security" />
      </div>
      <Card>
        <SectionTitle title="Verification Logs" subtitle="Credential verification events and consent scope shown." />
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_180px_120px]">
          <input className={inputClass} placeholder="Search AIN, institution, verifier, credential..." value={search} onChange={(event) => onSearch(event.target.value)} />
          <FilterSelect value={outcomeFilter} onChange={onOutcomeFilter} options={["ALL", "CONFIRMED", "DENIED", "DISCREPANCY", "REVOKED"]} />
          <button className={secondaryButtonClass} disabled={!logs.length} onClick={exportCsv} type="button">Export CSV</button>
        </div>
        <ResponsiveTable
          empty="No verification logs match this search or filter."
          headers={["AIN", "Institution", "Verifier", "Credential", "Outcome", "Scope", "Verified"]}
          rows={logs.map((log) => [
            <div key="ain"><p className="font-medium text-primary">{log.ain}</p><p className="text-xs text-textSecondary">{log.learnerName}</p></div>,
            <div key="institution"><p>{log.institutionName}</p><p className="text-xs text-textSecondary">{log.institutionId} / {log.institutionState}</p></div>,
            <div key="verifier"><p>{log.verifier}</p><p className="text-xs text-textSecondary">{titleCase(log.verifierType)}</p></div>,
            <div key="credential"><p className="font-mono text-xs text-primary">{log.credential}</p><p className="text-xs text-textSecondary">{titleCase(log.credentialType)} / {titleCase(log.credentialStatus)}</p></div>,
            <StatusBadge key="status" status={log.outcome} />,
            log.scopeShown,
            formatDate(log.verifiedAt)
          ])}
        />
      </Card>
    </div>
  );
}

function RevenuePage({ revenue }: { revenue: RevenueOverview | null }) {
  const verificationFees = revenue?.categoryBreakdown.find((entry) => entry.category === "VERIFICATION_FEE");
  const credentialExports = revenue?.categoryBreakdown.find((entry) => entry.category === "CREDENTIAL_EXPORT_FEE");
  const subscriptions = revenue?.categoryBreakdown.find((entry) => entry.category === "INSTITUTION_SUBSCRIPTION");

  function exportCsv() {
    if (!revenue?.recentEntries.length) return;
    const headers = ["Category", "Status", "Amount", "Institution", "Source", "Description", "Occurred At"];
    const rows = revenue.recentEntries.map((entry) => [
      titleCase(entry.category),
      entry.status,
      formatMoney(entry.amountMinor, entry.currency),
      entry.institutionName ?? "Platform",
      entry.sourceType,
      entry.description,
      entry.occurredAt
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll("\"", "\"\"")}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `acadid-revenue-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Verification Fees" value={formatMoney(verificationFees?.amountMinor ?? 0, revenue?.currency)} helper={`${verificationFees?.count ?? 0} ledger event(s)`} tone="success" icon="Revenue" />
        <MetricCard label="Credential Export Fees" value={formatMoney(credentialExports?.amountMinor ?? 0, revenue?.currency)} helper={`${credentialExports?.count ?? 0} export event(s)`} tone="accent" icon="Revenue" />
        <MetricCard label="Institution Subscriptions" value={formatMoney(subscriptions?.amountMinor ?? 0, revenue?.currency)} helper={`${revenue?.totals.activeSubscriptions ?? 0} active/trial subscriptions`} tone="warning" icon="Revenue" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Ledger" value={formatMoney(revenue?.totals.totalAmountMinor ?? 0, revenue?.currency)} helper="Billable, invoiced, and paid" tone="accent" icon="Revenue" />
        <MetricCard label="Paid This Month" value={formatMoney(revenue?.totals.paidThisMonthMinor ?? 0, revenue?.currency)} helper="Recognized paid entries" tone="success" icon="Revenue" />
        <MetricCard label="Open Billing" value={formatMoney(revenue?.totals.pendingThisMonthMinor ?? 0, revenue?.currency)} helper={`${revenue?.totals.openLedgerEntries ?? 0} open ledger entry(s)`} tone="warning" icon="Revenue" />
      </div>
      <Card>
        <SectionTitle title="Revenue Trend" subtitle={revenue ? `Last 30 days from ledger, updated ${formatDate(revenue.generatedAt)}.` : "Waiting for revenue ledger data."} />
        <RevenueBarChart data={revenue?.daily ?? []} currency={revenue?.currency ?? "NGN"} />
        <div className="mt-4 flex gap-2"><button className={secondaryButtonClass} disabled={!revenue?.recentEntries.length} onClick={exportCsv} type="button">Export CSV</button><button className={secondaryButtonClass} disabled={!revenue?.recentEntries.length} onClick={() => window.print()} type="button">Print / PDF</button></div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <SectionTitle title="Recent Ledger Entries" subtitle="Verification, credential export, and subscription billing events." />
          <ResponsiveTable
            empty="No revenue ledger entries yet. New verification, export, and subscription events will appear here."
            headers={["Category", "Amount", "Institution", "Source", "Status", "Occurred"]}
            rows={(revenue?.recentEntries ?? []).map((entry) => [
              titleCase(entry.category),
              formatMoney(entry.amountMinor, entry.currency),
              <div key="institution"><p>{entry.institutionName ?? "Platform"}</p><p className="text-xs text-textSecondary">{entry.institutionId ?? "No institution link"}</p></div>,
              <div key="source"><p>{entry.sourceType}</p><p className="text-xs text-textSecondary">{entry.description}</p></div>,
              <StatusBadge key="status" status={entry.status} />,
              formatDate(entry.occurredAt)
            ])}
          />
        </Card>
        <Card>
          <SectionTitle title="Institution Subscriptions" subtitle="Plan status for partner institutions." />
          <ResponsiveTable
            empty="No institution subscriptions are configured yet."
            headers={["Institution", "Plan", "Amount", "Status", "Next Billing"]}
            rows={(revenue?.subscriptions ?? []).map((subscription) => [
              <div key="institution"><p>{subscription.institutionName}</p><p className="text-xs text-textSecondary">{subscription.institutionId}</p></div>,
              subscription.planCode,
              `${formatMoney(subscription.amountMinor, subscription.currency)} / ${titleCase(subscription.billingInterval)}`,
              <StatusBadge key="status" status={subscription.status} />,
              subscription.nextBillingAt ? formatDate(subscription.nextBillingAt) : `Period ends ${formatDate(subscription.currentPeriodEnd)}`
            ])}
          />
        </Card>
      </div>
    </div>
  );
}

function BillingPage({ revenue, tab }: { revenue: RevenueOverview | null; tab: string }) {
  const entries = revenue?.recentEntries ?? [];
  const openEntries = entries.filter((entry) => ["BILLABLE", "INVOICED", "PENDING"].includes(entry.status));
  const rows = tab === "Invoices" ? openEntries : entries;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Open Billing" value={formatMoney(revenue?.totals.pendingThisMonthMinor ?? 0, revenue?.currency)} helper={`${revenue?.totals.openLedgerEntries ?? 0} open ledger entries`} tone="warning" icon="Billing" />
        <MetricCard label="Paid This Month" value={formatMoney(revenue?.totals.paidThisMonthMinor ?? 0, revenue?.currency)} helper="Confirmed payments" tone="success" icon="Revenue" />
        <MetricCard label="Subscriptions" value={revenue?.totals.activeSubscriptions ?? 0} helper="Active or trialing institutions" tone="accent" icon="Institutions" />
      </div>
      <Card>
        <SectionTitle title={tab} subtitle="Billing workspace for subscriptions, invoices, fee rules, and exports." />
        <ResponsiveTable
          empty="No billing records yet. Billing events will appear after verification, export, or subscription activity."
          headers={["Institution", "Category", "Amount", "Status", "Source", "Occurred"]}
          rows={rows.map((entry) => [
            <div key="institution"><p>{entry.institutionName ?? "Platform"}</p><p className="text-xs text-textSecondary">{entry.institutionId ?? "No institution link"}</p></div>,
            titleCase(entry.category),
            formatMoney(entry.amountMinor, entry.currency),
            <StatusBadge key="status" status={entry.status} />,
            entry.sourceType,
            formatDate(entry.occurredAt)
          ])}
        />
      </Card>
    </div>
  );
}

function ReportsPage({ auditEvents, revenue, tab, verificationLogs }: { auditEvents: AuditEvent[]; revenue: RevenueOverview | null; tab: string; verificationLogs: VerificationLog[] }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Audit Events" value={auditEvents.length} helper="Loaded control-plane events" tone="accent" icon="Reports" />
        <MetricCard label="Verification Logs" value={verificationLogs.length} helper="Loaded verification events" tone="success" icon="Verification Logs" />
        <MetricCard label="Ledger Entries" value={revenue?.recentEntries.length ?? 0} helper="Revenue records" tone="warning" icon="Revenue" />
        <MetricCard label="Export Center" value="Ready" helper="CSV/PDF export actions" tone="success" icon="Reports" />
      </div>
      <Card>
        <SectionTitle title={tab} subtitle="Focused reporting workspace for founder review and due diligence." />
        <ResponsiveTable
          empty="No report source records loaded yet."
          headers={["Report Signal", "Source", "Status", "When"]}
          rows={auditEvents.slice(0, 12).map((event) => [
            event.label,
            event.endpoint ?? event.targetType,
            <StatusBadge key="status" status={event.outcome} />,
            formatDate(event.createdAt)
          ])}
        />
      </Card>
    </div>
  );
}

function WebhooksPage({
  deliveries,
  endpoints,
  endpointForm,
  loading,
  onCreateEndpoint,
  onReplayDelivery,
  onRetryDelivery,
  onRotateSecret,
  onUpdateEndpointForm,
  onUpdateEndpointStatus,
  selectedInstitutionId,
  secret,
  tab
}: {
  deliveries: WebhookDelivery[];
  endpoints: WebhookEndpoint[];
  endpointForm: { label: string; targetUrl: string; eventTypes: string };
  loading: boolean;
  onCreateEndpoint: () => void;
  onReplayDelivery: (id: string) => void;
  onRetryDelivery: (id: string) => void;
  onRotateSecret: (id: string) => void;
  onUpdateEndpointForm: (value: { label: string; targetUrl: string; eventTypes: string }) => void;
  onUpdateEndpointStatus: (id: string, status: string) => void;
  selectedInstitutionId: string;
  secret: WebhookSecretResponse | null;
  tab: string;
}) {
  const failed = deliveries.filter((delivery) => ["FAILED", "DEAD_LETTER"].includes(delivery.status));
  const retrying = deliveries.filter((delivery) => ["PENDING", "RETRYING"].includes(delivery.status));
  const visibleDeliveries = tab === "Failed Deliveries" ? failed : tab === "Retry Queue" ? retrying : deliveries;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Endpoints" value={endpoints.length} helper="Configured callbacks" tone="accent" icon="Webhooks" />
        <MetricCard label="Deliveries" value={deliveries.length} helper="Recent delivery log" tone="success" icon="Webhooks" />
        <MetricCard label="Failed" value={failed.length} helper="Needs attention" tone={failed.length ? "error" : "success"} icon="Disputes" />
        <MetricCard label="Retry Queue" value={retrying.length} helper="Waiting for worker retry" tone="warning" icon="Background Jobs" />
      </div>
      {tab === "Endpoints" || tab === "Secret Rotation" ? (
        <Card>
          <SectionTitle title="Webhook Endpoints" subtitle="Create callbacks, rotate secrets, and suspend unsafe endpoints." />
          {secret ? <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm"><p className="font-semibold text-primary">One-time webhook secret</p><p className="mt-1 break-all font-mono text-xs text-primary">{secret.secret}</p><p className="mt-1 text-xs text-textSecondary">{secret.warning}</p></div> : null}
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.2fr_1.2fr_auto]">
            <Field label="Label"><input className={inputClass} value={endpointForm.label} onChange={(event) => onUpdateEndpointForm({ ...endpointForm, label: event.target.value })} /></Field>
            <Field label="Target URL"><input className={inputClass} value={endpointForm.targetUrl} onChange={(event) => onUpdateEndpointForm({ ...endpointForm, targetUrl: event.target.value })} /></Field>
            <Field label="Event types"><input className={inputClass} value={endpointForm.eventTypes} onChange={(event) => onUpdateEndpointForm({ ...endpointForm, eventTypes: event.target.value })} /></Field>
            <div className="flex items-end"><button className={primaryButtonClass} disabled={loading || !selectedInstitutionId} onClick={onCreateEndpoint} type="button">Create Endpoint</button></div>
          </div>
          <ResponsiveTable
            empty="No webhook endpoints configured yet."
            headers={["Endpoint", "Institution", "Status", "Secret", "Rotated", "Actions"]}
            rows={endpoints.map((endpoint) => [
              <div key="endpoint"><p className="font-medium text-primary">{endpoint.label}</p><p className="break-all text-xs text-textSecondary">{endpoint.targetUrl}</p></div>,
              <div key="institution"><p>{endpoint.institutionName}</p><p className="text-xs text-textSecondary">{endpoint.institutionId}</p></div>,
              <StatusBadge key="status" status={endpoint.status} />,
              endpoint.secretPreview ?? "--",
              endpoint.rotatedAt ? formatDate(endpoint.rotatedAt) : "Never",
              <div key="actions" className="flex flex-wrap gap-2"><button className={secondaryButtonClass} disabled={loading} onClick={() => onRotateSecret(endpoint.id)} type="button">Rotate</button><button className={secondaryButtonClass} disabled={loading || endpoint.status === "SUSPENDED"} onClick={() => onUpdateEndpointStatus(endpoint.id, "SUSPENDED")} type="button">Suspend</button><button className={primarySmallButtonClass} disabled={loading || endpoint.status === "ACTIVE"} onClick={() => onUpdateEndpointStatus(endpoint.id, "ACTIVE")} type="button">Activate</button></div>
            ])}
          />
        </Card>
      ) : null}
      {tab !== "Endpoints" && tab !== "Secret Rotation" ? (
        <Card>
          <SectionTitle title={tab} subtitle="Webhook delivery monitoring and retry controls." />
          <ResponsiveTable
            empty="No webhook deliveries in this workspace."
            headers={["Delivery", "Institution", "Status", "Attempts", "Next", "Actions"]}
            rows={visibleDeliveries.map((delivery) => [
              <div key="delivery"><p className="font-medium text-primary">{delivery.eventType}</p><p className="break-all text-xs text-textSecondary">{delivery.targetUrl}</p></div>,
              delivery.institutionName ?? delivery.institutionId ?? "Platform",
              <StatusBadge key="status" status={delivery.status} />,
              delivery.attempts.toLocaleString(),
              delivery.nextAttemptAt ? formatDate(delivery.nextAttemptAt) : delivery.deliveredAt ? formatDate(delivery.deliveredAt) : "--",
              <div key="actions" className="flex flex-wrap gap-2"><button className={secondaryButtonClass} disabled={loading || delivery.status === "DELIVERED"} onClick={() => onRetryDelivery(delivery.id)} type="button">Retry</button><button className={primarySmallButtonClass} disabled={loading} onClick={() => onReplayDelivery(delivery.id)} type="button">Replay</button></div>
            ])}
          />
        </Card>
      ) : null}
    </div>
  );
}

function BackgroundJobsPage({ deadLetters, health, loading, onRetryDeadLetterJob, onRetryNotification, tab }: { deadLetters: DeadLetterOverview | null; health: SystemHealth | null; loading: boolean; onRetryDeadLetterJob: (id: string) => void; onRetryNotification: (id: string) => void; tab: string }) {
  const queueHealth = health?.services.find((service) => service.name === "Background Workers")?.metadata;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Queued" value={health?.metrics.readyBackgroundJobs ?? "--"} helper="Ready worker jobs" tone="accent" icon="Background Jobs" />
        <MetricCard label="Running" value={queueHealth?.runningJobs ?? "--"} helper="Currently processing" tone="success" icon="Background Jobs" />
        <MetricCard label="Failed" value={deadLetters?.summary.failedJobs ?? "--"} helper="Dead-letter jobs" tone={(deadLetters?.summary.failedJobs ?? 0) > 0 ? "error" : "success"} icon="Disputes" />
        <MetricCard label="Workers" value={queueHealth?.activeWorkers ?? "--"} helper="Active heartbeat count" tone="accent" icon="System Health" />
      </div>
      <Card>
        <SectionTitle title={tab} subtitle="Background queues keep heavy work out of HTTP requests." />
        <ResponsiveTable
          empty="No background queue records for this workspace."
          headers={["Job", "Institution", "Attempts", "Error", "Failed", "Action"]}
          rows={(deadLetters?.jobs ?? []).map((job) => [
            <div key="job"><p className="font-medium text-primary">{titleCase(job.type)}</p><p className="text-xs text-textSecondary">{job.queue}</p></div>,
            job.institutionName ?? job.institutionId ?? "Platform",
            `${job.attempts}/${job.maxAttempts}`,
            job.error ?? "Failed",
            job.failedAt ? formatDate(job.failedAt) : formatDate(job.updatedAt),
            <button key="retry" className={primarySmallButtonClass} disabled={loading} onClick={() => onRetryDeadLetterJob(job.id)} type="button">Retry</button>
          ])}
        />
      </Card>
      <Card>
        <SectionTitle title="Failed Notifications" subtitle="Email, SMS, and push delivery failures waiting for worker retry." />
        <ResponsiveTable
          empty="No failed notifications need attention."
          headers={["Notification", "Channel", "Institution", "Error", "Updated", "Action"]}
          rows={(deadLetters?.notifications ?? []).map((notification) => [
            <div key="title"><p className="font-medium text-primary">{notification.title}</p><p className="text-xs text-textSecondary">{notification.type}</p></div>,
            <StatusBadge key="channel" status={notification.channel} />,
            notification.institutionName ?? notification.institutionId ?? "Platform",
            notification.error ?? "Failed",
            formatDate(notification.updatedAt),
            <button key="retry" className={primarySmallButtonClass} disabled={loading} onClick={() => onRetryNotification(notification.id)} type="button">Retry</button>
          ])}
        />
      </Card>
    </div>
  );
}

function AuditLogsPage({ auditEvents, tab }: { auditEvents: AuditEvent[]; tab: string }) {
  const filtered = tab === "Security Events"
    ? auditEvents.filter((event) => event.outcome === "FAILED" || event.outcome === "DENIED")
    : tab === "API Actions"
      ? auditEvents.filter((event) => event.actorType === "API_KEY" || event.endpoint?.includes("/api/"))
      : tab === "Institution Actions"
        ? auditEvents.filter((event) => event.institutionId || event.institutionName)
        : auditEvents;
  return (
    <Card>
      <SectionTitle title={tab} subtitle="Immutable audit trail for founder oversight, partner review, and due diligence." />
      <ResponsiveTable
        empty="No audit events match this workspace."
        headers={["Action", "Actor", "Endpoint", "Target", "Outcome", "When"]}
        rows={filtered.slice(0, 100).map((event) => [
          event.label,
          `${event.actorName}${event.actorType ? ` / ${event.actorType}` : ""}`,
          event.endpoint ? `${event.httpMethod ?? ""} ${event.endpoint}`.trim() : "No endpoint",
          event.institutionName ?? event.targetType,
          <StatusBadge key="outcome" status={event.outcome} />,
          formatDate(event.createdAt)
        ])}
      />
    </Card>
  );
}

function SystemHealthPage({
  cleanupHours,
  deadLetters,
  health,
  idempotencyCleanupHours,
  loading,
  onCleanupHours,
  onIdempotencyCleanupHours,
  onQueueIdempotencyCleanup,
  onQueueRateLimitCleanup,
  onRateLimitPolicyChange,
  onCreateWebhookEndpoint,
  onReplayWebhookDelivery,
  onRetryWebhookDelivery,
  onRotateWebhookEndpointSecret,
  onRetryDeadLetterJob,
  onRetryNotification,
  onSaveRateLimitPolicy,
  onUpdateWebhookEndpointForm,
  onUpdateWebhookEndpointStatus,
  rateLimitPolicy,
  rateLimitPolicyForm,
  selectedInstitutionId,
  webhookDeliveries,
  webhookEndpointForm,
  webhookEndpoints,
  webhookSecret
}: {
  cleanupHours: number;
  deadLetters: DeadLetterOverview | null;
  health: SystemHealth | null;
  idempotencyCleanupHours: number;
  loading: boolean;
  onCleanupHours: (value: number) => void;
  onIdempotencyCleanupHours: (value: number) => void;
  onQueueIdempotencyCleanup: () => void;
  onQueueRateLimitCleanup: () => void;
  onRateLimitPolicyChange: (value: RateLimitPolicyControl) => void;
  onCreateWebhookEndpoint: () => void;
  onReplayWebhookDelivery: (id: string) => void;
  onRetryWebhookDelivery: (id: string) => void;
  onRotateWebhookEndpointSecret: (id: string) => void;
  onRetryDeadLetterJob: (id: string) => void;
  onRetryNotification: (id: string) => void;
  onSaveRateLimitPolicy: () => void;
  onUpdateWebhookEndpointForm: (value: { label: string; targetUrl: string; eventTypes: string }) => void;
  onUpdateWebhookEndpointStatus: (id: string, status: string) => void;
  rateLimitPolicy: RateLimitPolicyResponse | null;
  rateLimitPolicyForm: RateLimitPolicyControl;
  selectedInstitutionId: string;
  webhookDeliveries: WebhookDelivery[];
  webhookEndpointForm: { label: string; targetUrl: string; eventTypes: string };
  webhookEndpoints: WebhookEndpoint[];
  webhookSecret: WebhookSecretResponse | null;
}) {
  const metrics = health?.metrics;
  const services = health?.services ?? [
    { name: "API Gateway", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Database", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Authentication Service", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Storage Service", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Email Service", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Cache Service", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Log Sink", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Background Workers", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Webhook Delivery", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." }
  ];
  const incidents = health?.incidents ?? [];
  const queueHealth = services.find((service) => service.name === "Background Workers")?.metadata;
  const webhookHealth = services.find((service) => service.name === "Webhook Delivery")?.metadata;
  const notificationHealth = services.find((service) => service.name === "Notification Delivery")?.metadata;
  const rateLimitHealth = services.find((service) => service.name === "Rate Limit Buckets")?.metadata;
  const idempotencyHealth = services.find((service) => service.name === "Idempotency Ledger")?.metadata;
  const storageHealth = services.find((service) => service.name === "Storage Service")?.metadata;
  const cacheHealth = services.find((service) => service.name === "Cache Service")?.metadata;
  const logSinkHealth = services.find((service) => service.name === "Log Sink")?.metadata;
  const updateRateLimitProduct = (productCode: string, value: number) => {
    onRateLimitPolicyChange({
      ...rateLimitPolicyForm,
      productDefaultsPerMinute: {
        ...rateLimitPolicyForm.productDefaultsPerMinute,
        [productCode]: value
      }
    });
  };
  const updateRateLimitEmergency = (value: Partial<RateLimitPolicyControl["emergency"]>) => {
    onRateLimitPolicyChange({
      ...rateLimitPolicyForm,
      emergency: {
        ...rateLimitPolicyForm.emergency,
        ...value
      }
    });
  };
  const updateRateLimitInstitutionDefaults = (value: Partial<RateLimitPolicyControl["institutionDefaultsPerMinute"]>) => {
    onRateLimitPolicyChange({
      ...rateLimitPolicyForm,
      institutionDefaultsPerMinute: {
        ...rateLimitPolicyForm.institutionDefaultsPerMinute,
        ...value
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Overall Status" value={titleCase(health?.overallStatus ?? "PENDING_CONFIGURATION")} helper={health ? `Updated ${formatDate(health.generatedAt)}` : "Waiting for health data"} tone={health?.overallStatus === "OPERATIONAL" ? "success" : health?.overallStatus === "DOWN" ? "error" : "warning"} icon="System Health" />
        <MetricCard label="Gateway Requests" value={metrics?.gatewayRequestsToday ?? "--"} helper="Last 24 hours" tone="accent" icon="API Keys" />
        <MetricCard label="Queue Backlog" value={metrics?.readyBackgroundJobs ?? "--"} helper="Ready worker jobs" tone={metrics && metrics.readyBackgroundJobs > 500 ? "warning" : "success"} icon="System Health" />
        <MetricCard label="Failed Jobs" value={metrics?.failedBackgroundJobs ?? "--"} helper="Last 24 hours" tone={metrics && metrics.failedBackgroundJobs > 0 ? "error" : "success"} icon="Disputes" />
        <MetricCard label="Pending Webhooks" value={metrics?.pendingWebhooks ?? "--"} helper="Pending or retrying" tone={metrics && metrics.pendingWebhooks > 50 ? "warning" : "accent"} icon="API Keys" />
        <MetricCard label="Error Rate" value={typeof metrics?.errorRate === "number" ? `${metrics.errorRate}%` : "--"} helper="Denied, revoked, discrepancy, failed audit" tone={metrics && metrics.errorRate > 0 ? "warning" : "success"} icon="Security" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
      <Card>
        <SectionTitle title="System Health" subtitle="Infrastructure status and incident review." />
        <div className="mt-4 divide-y divide-borderLight">
          {services.map((service) => (
            <div key={service.name} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="font-medium text-primary">{service.name}</p>
                <p className="text-xs text-textSecondary">{service.message}</p>
              </div>
              <div className="text-right">
                <StatusBadge status={service.status} />
                <p className="mt-1 text-xs text-textSecondary">{service.responseTimeMs}ms</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle title="Performance" subtitle="Gateway metrics from the Data Center." />
        <div className="grid gap-3">
          <MetricLine label="Metric query time" value={metrics ? `${metrics.responseTimeMs}ms` : "--"} />
          <MetricLine label="Verification events" value={String(metrics?.verificationEventsToday ?? "--")} />
          <MetricLine label="Audit events" value={String(metrics?.auditEventsToday ?? "--")} />
          <MetricLine label="Published credentials" value={String(metrics?.publishedCredentialsToday ?? "--")} />
          <MetricLine label="Denied verifications" value={String(metrics?.deniedVerificationEvents ?? "--")} />
          <MetricLine label="Revoked/discrepancy" value={String((metrics?.revokedVerificationEvents ?? 0) + (metrics?.discrepancyEvents ?? 0))} />
          <MetricLine label="Worker running jobs" value={String(queueHealth?.runningJobs ?? "--")} />
          <MetricLine label="Active workers" value={String(queueHealth?.activeWorkers ?? "--")} />
          <MetricLine label="Stale workers" value={String(queueHealth?.staleWorkers ?? "--")} />
          <MetricLine label="Storage provider" value={titleCase(String(storageHealth?.provider ?? "unconfigured"))} />
          <MetricLine label="Storage probe" value={storageHealth?.probeConfigured ? storageHealth.probeSucceeded ? "Passing" : "Failing" : "Not configured"} />
          <MetricLine label="Storage probe bytes" value={storageHealth?.probeBytes == null ? "--" : formatCompactNumber(storageHealth.probeBytes)} />
          <MetricLine label="Cache hit rate" value={typeof cacheHealth?.metrics?.hitRate === "number" ? `${cacheHealth.metrics.hitRate}%` : "--"} />
          <MetricLine label="Cache hits/misses" value={`${cacheHealth?.metrics?.totalHits ?? "--"} / ${cacheHealth?.metrics?.totalMisses ?? "--"}`} />
          <MetricLine label="Log sink" value={logSinkHealth?.configured ? titleCase(String(logSinkHealth.provider ?? "external")) : "Console only"} />
          <MetricLine label="Webhook delivered 24h" value={String(webhookHealth?.delivered24h ?? "--")} />
          <MetricLine label="Recent incidents" value={`${incidents.length} open`} />
          <MetricLine label="Uptime" value={health ? formatDuration(health.uptimeSeconds) : "--"} />
        </div>
      </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <SectionTitle title="Queue Backlog" subtitle="Background jobs by queue and state." />
          <ResponsiveTable
            empty="No background queue activity yet."
            headers={["Queue", "Queued", "Retrying", "Running", "Failed", "Total"]}
            rows={(queueHealth?.queues ?? []).map((queue) => [
              queue.queue,
              queue.queued.toLocaleString(),
              queue.retrying.toLocaleString(),
              queue.running.toLocaleString(),
              <StatusBadge key="failed" status={queue.failed > 0 ? `${queue.failed} Failed` : "0 Failed"} />,
              queue.total.toLocaleString()
            ])}
          />
        </Card>
        <Card>
          <SectionTitle title="Webhook Delivery" subtitle="Partner callback delivery state." />
          <div className="grid gap-3">
            <MetricLine label="Secret configured" value={webhookHealth?.secretConfigured ? "Yes" : "No"} />
            <MetricLine label="Due now" value={String(webhookHealth?.dueNow ?? "--")} />
            <MetricLine label="Failed in 24h" value={String(webhookHealth?.failed24h ?? "--")} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(webhookHealth?.statusBreakdown ?? []).map((item) => (
              <StatusBadge key={item.status} status={`${titleCase(item.status)} ${item.count}`} />
            ))}
          </div>
      </Card>
      </div>
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <SectionTitle title="Webhook Endpoints" subtitle="Create partner callbacks, rotate secrets, and recover failed delivery attempts." />
          <StatusBadge status={`${webhookEndpoints.length} Endpoint(s)`} />
        </div>
        {webhookSecret ? (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
            <p className="font-semibold text-primary">One-time webhook secret</p>
            <p className="mt-1 break-all font-mono text-xs text-primary">{webhookSecret.secret}</p>
            <p className="mt-1 text-xs text-textSecondary">{webhookSecret.warning}</p>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.2fr_1.2fr_auto]">
          <Field label="Label">
            <input className={inputClass} value={webhookEndpointForm.label} onChange={(event) => onUpdateWebhookEndpointForm({ ...webhookEndpointForm, label: event.target.value })} />
          </Field>
          <Field label="Target URL">
            <input className={inputClass} value={webhookEndpointForm.targetUrl} onChange={(event) => onUpdateWebhookEndpointForm({ ...webhookEndpointForm, targetUrl: event.target.value })} />
          </Field>
          <Field label="Event types">
            <input className={inputClass} value={webhookEndpointForm.eventTypes} onChange={(event) => onUpdateWebhookEndpointForm({ ...webhookEndpointForm, eventTypes: event.target.value })} />
          </Field>
          <div className="flex items-end">
            <button className={primaryButtonClass} disabled={loading || !selectedInstitutionId} onClick={onCreateWebhookEndpoint} type="button">Create Endpoint</button>
          </div>
        </div>
        <ResponsiveTable
          empty="No webhook endpoints have been configured yet."
          headers={["Endpoint", "Institution", "Status", "Secret", "Rotated", "Actions"]}
          rows={webhookEndpoints.slice(0, 12).map((endpoint) => [
            <div key="endpoint"><p className="font-medium text-primary">{endpoint.label}</p><p className="break-all text-xs text-textSecondary">{endpoint.targetUrl}</p></div>,
            <div key="institution"><p>{endpoint.institutionName}</p><p className="text-xs text-textSecondary">{endpoint.institutionId}</p></div>,
            <StatusBadge key="status" status={endpoint.status} />,
            endpoint.secretPreview ?? "--",
            endpoint.rotatedAt ? formatDate(endpoint.rotatedAt) : "Never",
            <div key="actions" className="flex flex-wrap gap-2">
              <button className={secondaryButtonClass} disabled={loading} onClick={() => onRotateWebhookEndpointSecret(endpoint.id)} type="button">Rotate</button>
              <button className={secondaryButtonClass} disabled={loading || endpoint.status === "SUSPENDED"} onClick={() => onUpdateWebhookEndpointStatus(endpoint.id, "SUSPENDED")} type="button">Suspend</button>
              <button className={primarySmallButtonClass} disabled={loading || endpoint.status === "ACTIVE"} onClick={() => onUpdateWebhookEndpointStatus(endpoint.id, "ACTIVE")} type="button">Activate</button>
            </div>
          ])}
        />
        <ResponsiveTable
          empty="No webhook deliveries yet."
          headers={["Delivery", "Institution", "Status", "Attempts", "Next", "Actions"]}
          rows={webhookDeliveries.slice(0, 10).map((delivery) => [
            <div key="delivery"><p className="font-medium text-primary">{delivery.eventType}</p><p className="break-all text-xs text-textSecondary">{delivery.targetUrl}</p></div>,
            delivery.institutionName ?? delivery.institutionId ?? "Platform",
            <StatusBadge key="status" status={delivery.status} />,
            delivery.attempts.toLocaleString(),
            delivery.nextAttemptAt ? formatDate(delivery.nextAttemptAt) : delivery.deliveredAt ? formatDate(delivery.deliveredAt) : "--",
            <div key="actions" className="flex flex-wrap gap-2">
              <button className={secondaryButtonClass} disabled={loading || delivery.status === "DELIVERED"} onClick={() => onRetryWebhookDelivery(delivery.id)} type="button">Retry</button>
              <button className={primarySmallButtonClass} disabled={loading} onClick={() => onReplayWebhookDelivery(delivery.id)} type="button">Replay</button>
            </div>
          ])}
        />
      </Card>
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <SectionTitle title="Rate-Limit Policy" subtitle="Founder-controlled API defaults and emergency throttling for products and institutions." />
          <StatusBadge status={rateLimitPolicyForm.emergency.enabled ? "EMERGENCY" : "ACTIVE"} />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-md border border-borderLight bg-soft p-3">
            <ToggleRow checked={rateLimitPolicyForm.emergency.enabled} label="Emergency throttle mode" onChange={(checked) => updateRateLimitEmergency({ enabled: checked })} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Emergency cap / minute">
                <input className={inputClass} min={1} max={100000} type="number" value={rateLimitPolicyForm.emergency.limitPerMinute} onChange={(event) => updateRateLimitEmergency({ limitPerMinute: Number(event.target.value) })} />
              </Field>
              <Field label="Last updated">
                <input className={inputClass} disabled value={rateLimitPolicy?.metadata.updatedAt ? formatDate(rateLimitPolicy.metadata.updatedAt) : "Default policy"} readOnly />
              </Field>
            </div>
            <Field label="Emergency reason">
              <input className={inputClass} value={rateLimitPolicyForm.emergency.reason ?? ""} onChange={(event) => updateRateLimitEmergency({ reason: event.target.value })} placeholder="Required when emergency mode is enabled" />
            </Field>
            <p className="mt-2 text-xs text-textSecondary">Emergency mode caps every API-key and route policy without revoking keys.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Institution sandbox default / minute">
              <input className={inputClass} min={1} max={100000} type="number" value={rateLimitPolicyForm.institutionDefaultsPerMinute.sandbox} onChange={(event) => updateRateLimitInstitutionDefaults({ sandbox: Number(event.target.value) })} />
            </Field>
            <Field label="Institution production default / minute">
              <input className={inputClass} min={1} max={100000} type="number" value={rateLimitPolicyForm.institutionDefaultsPerMinute.production} onChange={(event) => updateRateLimitInstitutionDefaults({ production: Number(event.target.value) })} />
            </Field>
            {productOptions.map((product) => (
              <Field key={product.code} label={`${product.name} / minute`}>
                <input className={inputClass} min={1} max={100000} type="number" value={rateLimitPolicyForm.productDefaultsPerMinute[product.code] ?? product.rateLimitPerMinute} onChange={(event) => updateRateLimitProduct(product.code, Number(event.target.value))} />
              </Field>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-textSecondary">{Object.keys(rateLimitPolicyForm.institutionOverridesPerMinute).length} institution override(s), {Object.keys(rateLimitPolicyForm.scopeOverrides).length} scope override(s).</p>
          <button className={primaryButtonClass} disabled={loading} onClick={onSaveRateLimitPolicy} type="button">Save Rate Policy</button>
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <SectionTitle title="Dead-Letter Review" subtitle="Exhausted jobs and failed deliveries needing operator action." />
          <StatusBadge status={(deadLetters?.summary.failedJobs ?? 0) + (deadLetters?.summary.failedWebhookDeliveries ?? 0) > 0 ? "ACTION NEEDED" : "CLEAR"} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <MetricLine label="Failed jobs" value={String(deadLetters?.summary.failedJobs ?? "--")} />
          <MetricLine label="Failed webhooks" value={String(deadLetters?.summary.failedWebhookDeliveries ?? "--")} />
          <MetricLine label="Failed notifications" value={String(deadLetters?.summary.failedNotifications ?? "--")} />
          <MetricLine label="Oldest failure" value={deadLetters?.summary.oldestFailedAt ? formatDate(deadLetters.summary.oldestFailedAt) : "--"} />
        </div>
        <ResponsiveTable
          empty="No dead-letter jobs need operator review."
          headers={["Job", "Institution", "Attempts", "Error", "Failed", "Action"]}
          rows={(deadLetters?.jobs ?? []).slice(0, 12).map((job) => [
            <div key="job"><p className="font-medium text-primary">{titleCase(job.type)}</p><p className="text-xs text-textSecondary">{job.queue}</p></div>,
            job.institutionName ?? job.institutionId ?? "Platform",
            `${job.attempts}/${job.maxAttempts}`,
            job.error ?? "Failed",
            job.failedAt ? formatDate(job.failedAt) : formatDate(job.updatedAt),
            <button key="retry" className={primarySmallButtonClass} disabled={loading} onClick={() => onRetryDeadLetterJob(job.id)} type="button">Retry</button>
          ])}
        />
        <ResponsiveTable
          empty="No failed webhook deliveries."
          headers={["Webhook", "Institution", "Attempts", "Error", "Updated"]}
          rows={(deadLetters?.webhookDeliveries ?? []).slice(0, 8).map((delivery) => [
            <div key="delivery"><p className="font-medium text-primary">{delivery.eventType}</p><p className="text-xs text-textSecondary">{delivery.targetUrl}</p></div>,
            delivery.institutionName ?? delivery.institutionId ?? "Platform",
            delivery.attempts.toLocaleString(),
            delivery.lastError ?? `HTTP ${delivery.lastStatusCode ?? "unknown"}`,
            formatDate(delivery.updatedAt)
          ])}
        />
      </Card>
      <Card>
        <SectionTitle title="Worker Registry" subtitle="Live worker heartbeat registry for scaled background processing." />
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <MetricLine label="Active" value={String(queueHealth?.activeWorkers ?? "--")} />
          <MetricLine label="Stale" value={String(queueHealth?.staleWorkers ?? "--")} />
          <MetricLine label="Stopped 24h" value={String(queueHealth?.stoppedWorkers ?? "--")} />
          <MetricLine label="Stale after" value={queueHealth?.workerStaleAfterSeconds ? `${queueHealth.workerStaleAfterSeconds}s` : "--"} />
        </div>
        <ResponsiveTable
          empty="No worker heartbeat has been recorded yet. Start an AcadID worker to register it."
          headers={["Worker", "Status", "Concurrency", "Current Queue", "Queues", "Last Seen"]}
          rows={(queueHealth?.workerHeartbeats ?? []).map((worker) => [
            <div key="worker">
              <p className="font-medium text-primary">{worker.workerId}</p>
              <p className="text-xs text-textSecondary">{worker.hostname ?? "Unknown host"}{worker.processId ? ` / pid ${worker.processId}` : ""}</p>
            </div>,
            <StatusBadge key="status" status={worker.status} />,
            worker.concurrency.toLocaleString(),
            worker.currentQueue ?? "Idle",
            worker.queues.slice(0, 3).join(", ") + (worker.queues.length > 3 ? ` +${worker.queues.length - 3}` : ""),
            formatDate(worker.lastSeenAt)
          ])}
        />
      </Card>
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <SectionTitle title="Notification Delivery" subtitle="Email, SMS, and push provider health with failed-delivery retry." />
          <StatusBadge status={services.find((service) => service.name === "Notification Delivery")?.status ?? "PENDING_CONFIGURATION"} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricLine label="Pending" value={String(notificationHealth?.pending ?? "--")} />
          <MetricLine label="Sent 24h" value={String(notificationHealth?.sent24h ?? "--")} />
          <MetricLine label="Failed 24h" value={String(notificationHealth?.failed24h ?? "--")} />
          <MetricLine label="Email provider" value={notificationHealth?.providers?.email.provider ?? "--"} />
          <MetricLine label="SMS provider" value={notificationHealth?.providers?.sms.provider ?? "--"} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(notificationHealth?.channelBreakdown ?? []).map((item) => (
            <StatusBadge key={`${item.channel}-${item.status}`} status={`${item.channel} ${titleCase(item.status)} ${item.count}`} />
          ))}
        </div>
        <ResponsiveTable
          empty="No failed notifications need attention."
          headers={["Notification", "Channel", "Institution", "Error", "Updated", "Action"]}
          rows={(notificationHealth?.recentFailures ?? []).map((notification) => [
            <div key="title"><p className="font-medium text-primary">{notification.title}</p><p className="text-xs text-textSecondary">{notification.type}</p></div>,
            <StatusBadge key="channel" status={notification.channel} />,
            notification.institutionName ?? notification.learnerName ?? notification.learnerAin ?? "Platform",
            notification.error ?? "Failed",
            formatDate(notification.updatedAt),
            <button key="retry" className={primarySmallButtonClass} disabled={loading} onClick={() => onRetryNotification(notification.id)} type="button">Retry</button>
          ])}
        />
      </Card>
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <SectionTitle title="Rate Limit Buckets" subtitle="Distributed API throttle counters and maintenance controls." />
            <StatusBadge status={services.find((service) => service.name === "Rate Limit Buckets")?.status ?? "PENDING_CONFIGURATION"} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <MetricLine label="Total buckets" value={String(rateLimitHealth?.totalBuckets ?? "--")} />
            <MetricLine label="Recent buckets" value={String(rateLimitHealth?.recentBuckets ?? "--")} />
            <MetricLine label="Stale buckets" value={String(rateLimitHealth?.staleBuckets ?? "--")} />
            <MetricLine label="Recent requests" value={String(rateLimitHealth?.recentRequests ?? "--")} />
          </div>
          <div className="mt-4 rounded-md border border-borderLight bg-soft p-3">
            <label className="text-xs font-medium text-textSecondary" htmlFor="rate-limit-cleanup-hours">Clean buckets older than</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input id="rate-limit-cleanup-hours" className={inputClass} min={1} max={720} type="number" value={cleanupHours} onChange={(event) => onCleanupHours(Number(event.target.value))} />
              <button className={primaryButtonClass} disabled={loading} onClick={onQueueRateLimitCleanup} type="button">Queue Cleanup Job</button>
            </div>
            <p className="mt-2 text-xs text-textSecondary">The API returns immediately; the maintenance worker deletes old buckets in the background.</p>
          </div>
        </Card>
        <Card>
          <SectionTitle title="Top Throttled Scopes" subtitle="Highest rate-limit activity over the last 24 hours." />
          <ResponsiveTable
            empty="No rate-limit activity has been recorded yet."
            headers={["Scope", "Requests", "Buckets"]}
            rows={(rateLimitHealth?.topScopes ?? []).map((scope) => [
              scope.scope,
              scope.requests.toLocaleString(),
              scope.buckets.toLocaleString()
            ])}
          />
        </Card>
      </div>
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <SectionTitle title="Idempotency Ledger" subtitle="Retry-safe POST and background-job dedupe records." />
          <StatusBadge status={services.find((service) => service.name === "Idempotency Ledger")?.status ?? "PENDING_CONFIGURATION"} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricLine label="Total records" value={String(idempotencyHealth?.totalRecords ?? "--")} />
          <MetricLine label="Recent records" value={String(idempotencyHealth?.recentRecords ?? "--")} />
          <MetricLine label="Expired records" value={String(idempotencyHealth?.expiredRecords ?? "--")} />
          <MetricLine label="Stale in progress" value={String(idempotencyHealth?.staleInProgressRecords ?? "--")} />
          <MetricLine label="Succeeded" value={String(idempotencyHealth?.succeededRecords ?? "--")} />
          <MetricLine label="Failed" value={String(idempotencyHealth?.failedRecords ?? "--")} />
        </div>
        <div className="mt-4 rounded-md border border-borderLight bg-soft p-3">
          <label className="text-xs font-medium text-textSecondary" htmlFor="idempotency-cleanup-hours">Clean expired records older than</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input id="idempotency-cleanup-hours" className={inputClass} min={1} max={2160} type="number" value={idempotencyCleanupHours} onChange={(event) => onIdempotencyCleanupHours(Number(event.target.value))} />
            <button className={primaryButtonClass} disabled={loading} onClick={onQueueIdempotencyCleanup} type="button">Queue Cleanup Job</button>
          </div>
          <p className="mt-2 text-xs text-textSecondary">The API returns immediately; the maintenance worker removes expired dedupe rows in the background.</p>
        </div>
        <div className="mt-4 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold text-primary">Top operations</p>
            <div className="mt-3 grid gap-2">
              {(idempotencyHealth?.topOperations ?? []).length ? (
                (idempotencyHealth?.topOperations ?? []).map((item) => <MetricLine key={item.operation} label={item.operation} value={item.count.toLocaleString()} />)
              ) : (
                <EmptyState text="No idempotency activity yet." />
              )}
            </div>
          </div>
          <ResponsiveTable
            empty="No recent idempotency records yet."
            headers={["Operation", "Status", "Scope", "Key", "Updated"]}
            rows={(idempotencyHealth?.latestRecords ?? []).map((record) => [
              record.operation,
              <StatusBadge key="status" status={record.status} />,
              record.scope,
              record.keyHashPreview,
              formatDate(record.updatedAt)
            ])}
          />
        </div>
      </Card>
      <Card>
        <SectionTitle title="Recent Incidents" subtitle="Derived from component degradation and gateway risk events." />
        <ResponsiveTable
          empty="No open incidents detected."
          headers={["Incident", "Severity", "Status", "Detected", "Message"]}
          rows={incidents.map((incident) => [
            incident.title,
            <StatusBadge key="severity" status={incident.severity} />,
            <StatusBadge key="status" status={incident.status} />,
            formatDate(incident.detectedAt),
            incident.message
          ])}
        />
      </Card>
    </div>
  );
}

function SecurityPage(props: {
  auditEvents: AuditEvent[];
  apiKeys: GlobalApiKey[];
  loading: boolean;
  mfaEnabled: boolean;
  onEmergencyLockdown: () => void;
  onEnableTotp: (event: FormEvent<HTMLFormElement>) => void;
  onRotateRecoveryCodes: (event: FormEvent<HTMLFormElement>) => void;
  onSetupTotp: () => void;
  recoveryCodeStatus: RecoveryCodeStatus | null;
  recoveryRotateCode: string;
  setNewRecoveryCodes: (value: RecoveryCodeRotation | null) => void;
  setRecoveryRotateCode: (value: string) => void;
  setTotpEnableCode: (value: string) => void;
  newRecoveryCodes: RecoveryCodeRotation | null;
  totpEnableCode: string;
  totpSetup: TotpSetup | null;
}) {
  const loginEvents = props.auditEvents.filter((event) => event.action === "auth.login").slice(0, 5);
  const apiSecurityEvents = props.auditEvents.filter((event) => event.action.includes("api_key")).slice(0, 5);
  const activeSessions = loginEvents.length ? "Current browser session" : "No tracked session yet";
  const revokedKeys = props.apiKeys.filter((key) => key.status === "REVOKED").length;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <SectionTitle title="Founder TOTP" subtitle="Authenticator code protection for founder login." />
          <StatusBadge status={props.mfaEnabled ? "Enabled" : "Not Enabled"} />
        </div>
        <button className={`${secondaryButtonClass} mt-4`} disabled={props.loading} onClick={props.onSetupTotp} type="button">{props.mfaEnabled ? "Reset TOTP setup" : "Start TOTP setup"}</button>
        {props.totpSetup ? (
          <form className="mt-4 space-y-3" onSubmit={props.onEnableTotp}>
            <SecretCode label="Secret" value={props.totpSetup.secret} />
            <SecretCode label="Authenticator URL" value={props.totpSetup.otpauthUrl} />
            <input className={inputClass} value={props.totpEnableCode} onChange={(event) => props.setTotpEnableCode(event.target.value)} inputMode="numeric" placeholder="6-digit code" />
            <button className={primaryButtonClass} disabled={props.loading}>Enable TOTP</button>
          </form>
        ) : <EmptyState text="No setup secret on screen. Start setup when ready." />}
      </Card>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <SectionTitle title="Recovery Codes" subtitle="One-time backup codes for founder MFA recovery." />
          <StatusBadge status={`${props.recoveryCodeStatus?.remaining ?? 0} Remaining`} />
        </div>
        <div className="mt-4 grid gap-3">
          <MetricLine label="Remaining codes" value={String(props.recoveryCodeStatus?.remaining ?? 0)} />
          <MetricLine label="Last generated" value={props.recoveryCodeStatus?.generatedAt ? formatDate(props.recoveryCodeStatus.generatedAt) : "Not generated"} />
        </div>
        <form className="mt-4 space-y-3" onSubmit={props.onRotateRecoveryCodes}>
          <Field label="Authenticator code">
            <input className={inputClass} value={props.recoveryRotateCode} onChange={(event) => props.setRecoveryRotateCode(event.target.value)} inputMode="numeric" placeholder="6-digit code required" />
          </Field>
          <button className={secondaryButtonClass} disabled={props.loading || !props.mfaEnabled} type="submit">Rotate Recovery Codes</button>
        </form>
        {props.newRecoveryCodes ? (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="text-sm font-medium text-primary">{props.newRecoveryCodes.warning}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {props.newRecoveryCodes.recoveryCodes.map((code) => <code key={code} className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-primary">{code}</code>)}
            </div>
            <button className={`${primarySmallButtonClass} mt-3`} onClick={() => props.setNewRecoveryCodes(null)} type="button">I have saved them</button>
          </div>
        ) : null}
      </Card>
      <Card>
        <SectionTitle title="Security Operations" subtitle="Founder access, API key actions, and audit trail." />
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-borderLight bg-soft p-3"><p className="text-xs text-textSecondary">Session</p><p className="mt-1 text-sm font-semibold text-primary">{activeSessions}</p></div>
            <div className="rounded-lg border border-borderLight bg-soft p-3"><p className="text-xs text-textSecondary">API key events</p><p className="mt-1 text-sm font-semibold text-primary">{apiSecurityEvents.length}</p></div>
            <div className="rounded-lg border border-borderLight bg-soft p-3"><p className="text-xs text-textSecondary">Revoked keys</p><p className="mt-1 text-sm font-semibold text-primary">{revokedKeys}</p></div>
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">Login history</p>
            <ListBlock
              empty="No founder login audit events recorded yet."
              items={loginEvents.map((event) => ({
                id: event.id,
                title: event.actorName,
                meta: event.actorEmail ?? event.actorRole ?? "Founder",
                status: event.outcome,
                date: formatDate(event.createdAt)
              }))}
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">API key security logs</p>
            <ListBlock
              empty="No API key security events recorded yet."
              items={apiSecurityEvents.map((event) => ({
                id: event.id,
                title: event.label,
                meta: event.institutionName ?? event.actorName,
                status: event.outcome,
                date: formatDate(event.createdAt)
              }))}
            />
          </div>
          <ResponsiveTable
            empty="No founder audit events recorded yet."
            headers={["Action", "Actor", "Endpoint", "Trace", "Outcome", "When"]}
            rows={props.auditEvents.slice(0, 12).map((event) => [
              event.label,
              `${event.actorName}${event.actorType ? ` / ${event.actorType}` : ""}`,
              event.endpoint ? `${event.httpMethod ?? ""} ${event.endpoint}`.trim() : `${event.targetType}${event.institutionName ? ` / ${event.institutionName}` : ""}`,
              event.requestId ? event.requestId.slice(0, 8) : "No request ID",
              <StatusBadge key="outcome" status={event.outcome} />,
              formatDate(event.createdAt)
            ])}
          />
          <button className="h-10 rounded-md border border-error px-4 text-sm font-medium text-error disabled:opacity-60" disabled={props.loading} onClick={props.onEmergencyLockdown} type="button">Emergency lockdown</button>
        </div>
      </Card>
    </div>
  );
}

function SettingsPage({
  founderName,
  loading,
  onSave,
  settings
}: {
  founderName: string;
  loading: boolean;
  onSave: (settings: PlatformSettings) => Promise<void>;
  settings: PlatformSettingsResponse | null;
}) {
  const [form, setForm] = useState<PlatformSettings>(settings?.settings ?? defaultPlatformSettings);

  useEffect(() => {
    setForm(settings?.settings ?? defaultPlatformSettings);
  }, [settings]);

  function updateGroup<Group extends keyof PlatformSettings>(group: Group, patch: Partial<PlatformSettings[Group]>) {
    setForm((current) => ({
      ...current,
      [group]: {
        ...current[group],
        ...patch
      }
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(form);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Founder" value={founderName} helper="Super Admin profile" tone="accent" icon="Settings" />
        <MetricCard label="Persisted Groups" value={settings?.metadata.persistedKeys.length ?? 0} helper="Approval, API, notifications, templates" tone="success" icon="Settings" />
        <MetricCard label="Last Updated" value={settings?.metadata.updatedAt ? formatDate(settings.metadata.updatedAt) : "Defaults"} helper={settings?.metadata.updatedBy?.fullName ?? "Not persisted yet"} tone="warning" icon="Settings" />
      </div>
      <form className="grid gap-5 xl:grid-cols-2" onSubmit={submit}>
        <Card>
          <SectionTitle title="Institution Approval" subtitle="Rules used by the Institution Portal review workflow." />
          <div className="mt-4 grid gap-3">
            <ToggleRow checked={form.approval.requireMou} label="Require signed MOU" onChange={(checked) => updateGroup("approval", { requireMou: checked })} />
            <ToggleRow checked={form.approval.requireDocumentUpload} label="Require document upload" onChange={(checked) => updateGroup("approval", { requireDocumentUpload: checked })} />
            <ToggleRow checked={form.approval.allowAutoApprove} label="Allow auto-approval" onChange={(checked) => updateGroup("approval", { allowAutoApprove: checked })} />
            <Field label="Maximum review days">
              <input className={inputClass} min={1} max={90} type="number" value={form.approval.maxApplicationReviewDays} onChange={(event) => updateGroup("approval", { maxApplicationReviewDays: Number(event.target.value) })} />
            </Field>
          </div>
        </Card>
        <Card>
          <SectionTitle title="API Defaults" subtitle="Default environment, rate limits, and rotation windows." />
          <div className="mt-4 grid gap-3">
            <Field label="Default environment">
              <select className={inputClass} value={form.api.defaultEnvironment} onChange={(event) => updateGroup("api", { defaultEnvironment: event.target.value as "SANDBOX" | "PRODUCTION" })}>
                <option value="SANDBOX">Sandbox</option>
                <option value="PRODUCTION">Production</option>
              </select>
            </Field>
            <Field label="Default rate limit per minute">
              <input className={inputClass} min={10} max={100000} type="number" value={form.api.defaultRateLimitPerMinute} onChange={(event) => updateGroup("api", { defaultRateLimitPerMinute: Number(event.target.value) })} />
            </Field>
            <Field label="Product key rotation days">
              <input className={inputClass} min={1} max={730} type="number" value={form.api.productKeyRotationDays} onChange={(event) => updateGroup("api", { productKeyRotationDays: Number(event.target.value) })} />
            </Field>
            <Field label="Institution key rotation days">
              <input className={inputClass} min={1} max={730} type="number" value={form.api.institutionKeyRotationDays} onChange={(event) => updateGroup("api", { institutionKeyRotationDays: Number(event.target.value) })} />
            </Field>
          </div>
        </Card>
        <Card>
          <SectionTitle title="Notifications" subtitle="Founder alert routing for control-plane events." />
          <div className="mt-4 grid gap-3">
            <Field label="Founder email">
              <input className={inputClass} type="email" value={form.notifications.founderEmail} onChange={(event) => updateGroup("notifications", { founderEmail: event.target.value })} />
            </Field>
            <ToggleRow checked={form.notifications.notifyOnNewApplication} label="New institution applications" onChange={(checked) => updateGroup("notifications", { notifyOnNewApplication: checked })} />
            <ToggleRow checked={form.notifications.notifyOnDeveloperRequest} label="Developer access requests" onChange={(checked) => updateGroup("notifications", { notifyOnDeveloperRequest: checked })} />
            <ToggleRow checked={form.notifications.notifyOnDispute} label="Credential disputes" onChange={(checked) => updateGroup("notifications", { notifyOnDispute: checked })} />
            <ToggleRow checked={form.notifications.weeklySummaryEnabled} label="Weekly founder summary" onChange={(checked) => updateGroup("notifications", { weeklySummaryEnabled: checked })} />
          </div>
        </Card>
        <Card>
          <SectionTitle title="Email Templates" subtitle="Subject lines used by institution and governance workflows." />
          <div className="mt-4 grid gap-3">
            <Field label="Application approved subject">
              <input className={inputClass} value={form.emailTemplates.applicationApprovedSubject} onChange={(event) => updateGroup("emailTemplates", { applicationApprovedSubject: event.target.value })} />
            </Field>
            <Field label="Application rejected subject">
              <input className={inputClass} value={form.emailTemplates.applicationRejectedSubject} onChange={(event) => updateGroup("emailTemplates", { applicationRejectedSubject: event.target.value })} />
            </Field>
            <Field label="Developer access approved subject">
              <input className={inputClass} value={form.emailTemplates.developerAccessApprovedSubject} onChange={(event) => updateGroup("emailTemplates", { developerAccessApprovedSubject: event.target.value })} />
            </Field>
            <Field label="Dispute notice subject">
              <input className={inputClass} value={form.emailTemplates.disputeNoticeSubject} onChange={(event) => updateGroup("emailTemplates", { disputeNoticeSubject: event.target.value })} />
            </Field>
          </div>
        </Card>
        <div className="xl:col-span-2">
          <button className={`${primaryButtonClass} w-full md:w-auto`} disabled={loading} type="submit">{loading ? "Saving..." : "Save Settings"}</button>
        </div>
      </form>
    </div>
  );
}

function buildWorkspaceTabs(page: PageKey, data: {
  applications: InstitutionApplication[];
  apiKeys: GlobalApiKey[];
  auditEvents: AuditEvent[];
  deadLetters: DeadLetterOverview | null;
  developerRequests: DeveloperAccessRequest[];
  disputes: Dispute[];
  failedVerifications: VerificationLog[];
  failedWebhookDeliveries: WebhookDelivery[];
  institutions: Institution[];
  invitationLeads: InvitationLead[];
  recordRequests: RecordRequest[];
  systemHealth: SystemHealth | null;
  webhookDeliveries: WebhookDelivery[];
  webhookEndpoints: WebhookEndpoint[];
}): WorkspaceTab[] {
  const failedJobs = data.deadLetters?.summary.failedJobs ?? 0;
  const failedNotifications = data.deadLetters?.summary.failedNotifications ?? 0;
  const overdueRecords = data.recordRequests.filter((request) => request.status === "ESCALATED" || (request.status !== "FULFILLED" && daysSince(request.submittedAt) >= 14)).length;
  const tabs: Record<PageKey, WorkspaceTab[]> = {
    Overview: [
      { label: "Platform Summary" },
      { label: "Alerts", count: data.failedWebhookDeliveries.length + failedJobs + data.applications.filter((item) => item.status === "PENDING").length, tone: "warning" },
      { label: "Recent Activity", count: data.auditEvents.length, tone: "accent" },
      { label: "Revenue Snapshot" },
      { label: "System Health", count: data.systemHealth?.overallStatus === "OPERATIONAL" ? 0 : 1, tone: data.systemHealth?.overallStatus === "OPERATIONAL" ? "success" : "warning" }
    ],
    Institutions: [
      { label: "Active Institutions", count: data.institutions.filter((item) => item.status === "ACTIVE").length, tone: "success" },
      { label: "Pending Setup", count: data.institutions.filter((item) => item.status === "ACTIVE" && !item.mouSignedAt).length, tone: "warning" },
      { label: "Suspended", count: data.institutions.filter((item) => item.status === "SUSPENDED").length, tone: "error" },
      { label: "Institution Health" },
      { label: "Directory Status" }
    ],
    "Academic Operations": [
      { label: "Academic Structure Issues" },
      { label: "Missing Grading Rules" },
      { label: "Missing Subjects/Courses" },
      { label: "Unscoped Staff" },
      { label: "Validation Jobs" },
      { label: "Setup Readiness" }
    ],
    "Institution Applications": [
      { label: "New Applications", count: data.applications.filter((item) => item.status === "PENDING").length, tone: "warning" },
      { label: "Under Review", count: data.applications.filter((item) => String(item.status) === "UNDER_REVIEW").length, tone: "accent" },
      { label: "Needs More Info", count: data.applications.filter((item) => String(item.status) === "NEEDS_MORE_INFORMATION").length, tone: "warning" },
      { label: "Approved", count: data.applications.filter((item) => item.status === "APPROVED").length, tone: "success" },
      { label: "Rejected", count: data.applications.filter((item) => item.status === "REJECTED").length, tone: "error" }
    ],
    "API Keys": [
      { label: "Active Keys", count: data.apiKeys.filter((item) => item.status === "ACTIVE").length, tone: "success" },
      { label: "Sandbox Keys", count: data.apiKeys.filter((item) => item.environment === "SANDBOX").length, tone: "accent" },
      { label: "Revoked Keys", count: data.apiKeys.filter((item) => item.status === "REVOKED").length, tone: "error" },
      { label: "Usage Logs" },
      { label: "Generate Key" }
    ],
    "Developer Access Requests": [
      { label: "Pending Requests", count: data.developerRequests.filter((item) => item.status === "PENDING").length, tone: "warning" },
      { label: "Approved", count: data.developerRequests.filter((item) => item.status === "APPROVED").length, tone: "success" },
      { label: "Rejected", count: data.developerRequests.filter((item) => item.status === "REJECTED").length, tone: "error" },
      { label: "API Usage" },
      { label: "Risk Review" }
    ],
    Webhooks: [
      { label: "Endpoints", count: data.webhookEndpoints.length, tone: "accent" },
      { label: "Delivery Logs", count: data.webhookDeliveries.length, tone: "accent" },
      { label: "Failed Deliveries", count: data.failedWebhookDeliveries.length, tone: "error" },
      { label: "Secret Rotation" },
      { label: "Retry Queue", count: data.webhookDeliveries.filter((item) => ["PENDING", "RETRYING"].includes(item.status)).length, tone: "warning" }
    ],
    "Record Requests": [
      { label: "Invitation Leads", count: data.invitationLeads.filter((item) => item.status === "NEW").length, tone: "warning" },
      { label: "Active Requests", count: data.recordRequests.filter((item) => !["FULFILLED", "REJECTED", "CANCELLED"].includes(item.status)).length, tone: "accent" },
      { label: "Overdue", count: overdueRecords, tone: "error" },
      { label: "Escalated", count: data.recordRequests.filter((item) => item.status === "ESCALATED").length, tone: "error" },
      { label: "Completed", count: data.recordRequests.filter((item) => item.status === "FULFILLED").length, tone: "success" }
    ],
    Disputes: [
      { label: "Open", count: data.disputes.filter((item) => item.status === "OPEN").length, tone: "warning" },
      { label: "Escalated", count: data.disputes.filter((item) => item.status === "ESCALATED").length, tone: "error" },
      { label: "Institution Response Needed", count: data.disputes.filter((item) => !item.noticeSentAt && item.status !== "RESOLVED").length, tone: "warning" },
      { label: "Resolved", count: data.disputes.filter((item) => item.status === "RESOLVED").length, tone: "success" },
      { label: "Closed", count: data.disputes.filter((item) => item.status === "RESOLVED").length, tone: "success" }
    ],
    "Verification Logs": [
      { label: "Recent Verifications", count: data.webhookDeliveries.length ? undefined : data.failedVerifications.length },
      { label: "Failed Verifications", count: data.failedVerifications.length, tone: "error" },
      { label: "Suspicious Activity", count: data.failedVerifications.length, tone: "warning" },
      { label: "Employer Checks" },
      { label: "Credential Checks" }
    ],
    "Background Jobs": [
      { label: "Queued", count: data.systemHealth?.metrics.readyBackgroundJobs, tone: "accent" },
      { label: "Running" },
      { label: "Retrying" },
      { label: "Failed", count: failedJobs + failedNotifications, tone: "error" },
      { label: "Completed" }
    ],
    Revenue: [
      { label: "Overview" },
      { label: "Institution Earnings" },
      { label: "AcadID Earnings" },
      { label: "Escrow" },
      { label: "Payouts" }
    ],
    Billing: [
      { label: "Subscriptions" },
      { label: "Invoices" },
      { label: "Payment Events" },
      { label: "Fee Rules" },
      { label: "Exports" }
    ],
    Reports: [
      { label: "Platform Reports" },
      { label: "Institution Reports" },
      { label: "Verification Reports" },
      { label: "Revenue Reports" },
      { label: "Export Center" }
    ],
    "System Health": [
      { label: "API Health" },
      { label: "Database" },
      { label: "Cache" },
      { label: "Workers" },
      { label: "Queue" },
      { label: "Webhooks" },
      { label: "Storage" }
    ],
    "Audit Logs": [
      { label: "Founder Actions", count: data.auditEvents.filter((item) => item.actorRole?.includes("SUPER") || item.actorName.includes("Founder")).length, tone: "accent" },
      { label: "Institution Actions" },
      { label: "API Actions" },
      { label: "Security Events", count: data.auditEvents.filter((item) => item.outcome === "FAILED" || item.outcome === "DENIED").length, tone: "error" },
      { label: "Export Logs" }
    ],
    Security: [
      { label: "Founder TOTP" },
      { label: "Login History", count: data.auditEvents.filter((item) => item.action.includes("login")).length, tone: "accent" },
      { label: "Sessions" },
      { label: "API Key Security" },
      { label: "Emergency Lockdown" }
    ],
    Settings: [
      { label: "Founder Profile" },
      { label: "Platform Settings" },
      { label: "Email Templates" },
      { label: "Approval Rules" },
      { label: "Notifications" }
    ]
  };
  return tabs[page];
}

function WorkspaceTabs({ activeTab, onChange, tabs }: { activeTab: string; onChange: (tab: string) => void; tabs: WorkspaceTab[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borderLight bg-white p-2 shadow-sm">
      <div className="flex min-w-max gap-2">
        {tabs.map((tab) => {
          const active = tab.label === activeTab;
          return (
            <button key={tab.label} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-accent text-white" : "text-textSecondary hover:bg-soft hover:text-primary"}`} onClick={() => onChange(tab.label)} type="button">
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 ? <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20 text-white" : tab.tone === "error" ? "bg-error/10 text-error" : tab.tone === "warning" ? "bg-warning/10 text-warning" : tab.tone === "success" ? "bg-success/10 text-success" : "bg-accent/10 text-accent"}`}>{tab.count > 99 ? "99+" : tab.count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function filterInstitutionsForTab(institutions: Institution[], tab: string) {
  if (tab === "Suspended") return institutions.filter((institution) => institution.status === "SUSPENDED");
  if (tab === "Pending Setup") return institutions.filter((institution) => institution.status === "ACTIVE" && !institution.mouSignedAt);
  return institutions.filter((institution) => tab === "Active Institutions" ? institution.status === "ACTIVE" : true);
}

function filterApplicationsForTab(applications: InstitutionApplication[], tab: string) {
  const statusByTab: Record<string, string[]> = {
    "New Applications": ["PENDING"],
    "Under Review": ["UNDER_REVIEW", "PENDING"],
    "Needs More Info": ["NEEDS_MORE_INFORMATION"],
    Approved: ["APPROVED"],
    Rejected: ["REJECTED"]
  };
  const statuses = statusByTab[tab];
  return statuses ? applications.filter((application) => statuses.includes(String(application.status))) : applications;
}

function filterApiKeysForTab(keys: GlobalApiKey[], tab: string) {
  if (tab === "Active Keys") return keys.filter((key) => key.status === "ACTIVE");
  if (tab === "Sandbox Keys") return keys.filter((key) => key.environment === "SANDBOX");
  if (tab === "Revoked Keys") return keys.filter((key) => key.status === "REVOKED");
  return keys;
}

function filterDeveloperRequestsForTab(requests: DeveloperAccessRequest[], tab: string) {
  if (tab === "Pending Requests") return requests.filter((request) => request.status === "PENDING");
  if (["Approved", "Rejected"].includes(tab)) return requests.filter((request) => request.status === tab.toUpperCase());
  return requests;
}

function filterDisputesForTab(disputes: Dispute[], tab: string) {
  if (tab === "Open") return disputes.filter((dispute) => dispute.status === "OPEN");
  if (tab === "Escalated") return disputes.filter((dispute) => dispute.status === "ESCALATED");
  if (tab === "Institution Response Needed") return disputes.filter((dispute) => !dispute.noticeSentAt && dispute.status !== "RESOLVED");
  if (["Resolved", "Closed"].includes(tab)) return disputes.filter((dispute) => dispute.status === "RESOLVED");
  return disputes;
}

function filterVerificationLogsForTab(logs: VerificationLog[], tab: string) {
  if (tab === "Failed Verifications" || tab === "Suspicious Activity") {
    return logs.filter((log) => ["FAILED", "REVOKED", "DENIED", "DISCREPANCY"].some((term) => log.outcome.toUpperCase().includes(term)));
  }
  if (tab === "Employer Checks") return logs.filter((log) => log.verifierType.toUpperCase().includes("EMPLOYER"));
  if (tab === "Credential Checks") return logs.filter((log) => log.credentialType || log.credential);
  return logs;
}

function latestWorkspaceUpdate(page: PageKey, data: { dashboardSummary: DashboardSummary | null; systemHealth: SystemHealth | null; deadLetters: DeadLetterOverview | null; revenueOverview: RevenueOverview | null }) {
  if (page === "System Health" || page === "Webhooks" || page === "Background Jobs") return data.systemHealth?.generatedAt ?? data.deadLetters?.generatedAt ?? null;
  if (page === "Revenue" || page === "Billing" || page === "Reports") return data.revenueOverview?.generatedAt ?? null;
  return data.dashboardSummary?.generatedAt ?? null;
}

function PageHeading({ activePage, onGenerateKey, updatedAt }: { activePage: PageKey; onGenerateKey: () => void; updatedAt?: string | null }) {
  const subtitle =
    activePage === "Overview"
      ? "Here's what's happening across ACAD.ID infrastructure today."
      : `${activePage} operations and control workflows.`;
  const showGenerateKey = activePage === "API Keys";
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold leading-tight text-primary">{activePage === "Overview" ? "Welcome back, Founder" : activePage}</h1>
        <p className="mt-1 text-sm text-textSecondary">{subtitle}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-textSecondary">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span>{updatedAt ? `Updated ${formatDate(updatedAt)}` : "Live workspace"}</span>
          <span className="rounded-full bg-soft px-2 py-0.5 text-primary">Auto-refresh ready</span>
        </div>
      </div>
      {showGenerateKey ? <button className={`${primaryButtonClass} w-full md:w-auto`} onClick={onGenerateKey} type="button">+ Generate API Key</button> : null}
    </div>
  );
}

function InstitutionDetail({
  apiKeys,
  auditEvents,
  developerRequests,
  institution,
  loading,
  onInviteStaff,
  onUpdateStaff,
  onUpdateStaffInviteForm,
  staff,
  staffInviteForm,
  staffLoading,
  verificationLogs
}: {
  apiKeys: GlobalApiKey[];
  auditEvents: AuditEvent[];
  developerRequests: DeveloperAccessRequest[];
  institution?: Institution;
  loading: boolean;
  onInviteStaff: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateStaff: (staffId: string, body: Record<string, unknown>) => void;
  onUpdateStaffInviteForm: (value: { fullName: string; email: string; phone: string; role: string; permissions: string; assignedScopes: string }) => void;
  staff: InstitutionStaff[];
  staffInviteForm: { fullName: string; email: string; phone: string; role: string; permissions: string; assignedScopes: string };
  staffLoading: boolean;
  verificationLogs: VerificationLog[];
}) {
  if (!institution) return <Card><SectionTitle title="Institution Details" subtitle="Select an institution." /><EmptyState text="No institution selected." /></Card>;
  const institutionKeys = apiKeys.filter((key) => key.institutionUuid === institution.uuid);
  const institutionDeveloperRequest = developerRequests.find((request) => request.institutionId === institution.uuid);
  const institutionVerifications = verificationLogs.filter((log) => log.institutionId === institution.institutionId);
  const institutionAuditEvents = auditEvents.filter((event) => event.institutionId === institution.institutionId || event.institutionName === institution.officialName).slice(0, 5);
  return (
    <Card>
      <SectionTitle title="Institution Details" subtitle={institution.institutionId} />
      <div className="mt-4 grid gap-3">
        <MetricLine label="Official name" value={institution.officialName} />
        <MetricLine label="Type" value={titleCase(institution.type)} />
        <MetricLine label="State" value={institution.state} />
        <MetricLine label="Tier" value={titleCase(institution.tier)} />
        <MetricLine label="Status" value={titleCase(institution.status)} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-borderLight bg-soft p-3">
          <p className="text-xs text-textSecondary">Staff</p>
          <p className="mt-1 text-sm font-semibold text-primary">{staffLoading ? "Loading..." : `${staff.filter((member) => member.status === "ACTIVE").length} active / ${staff.length} total`}</p>
        </div>
        <div className="rounded-lg border border-borderLight bg-soft p-3">
          <p className="text-xs text-textSecondary">Learners</p>
          <p className="mt-1 text-sm font-semibold text-primary">Institution learner aggregate pending</p>
        </div>
        <div className="rounded-lg border border-borderLight bg-soft p-3">
          <p className="text-xs text-textSecondary">Results / verification</p>
          <p className="mt-1 text-sm font-semibold text-primary">{institutionVerifications.length} verification events</p>
        </div>
        <div className="rounded-lg border border-borderLight bg-soft p-3">
          <p className="text-xs text-textSecondary">API status</p>
          <p className="mt-1 text-sm font-semibold text-primary">{institutionKeys.filter((key) => key.status === "ACTIVE").length} active keys</p>
        </div>
        <div className="rounded-lg border border-borderLight bg-soft p-3">
          <p className="text-xs text-textSecondary">MOU</p>
          <p className="mt-1 text-sm font-semibold text-primary">{institution.mouSignedAt ? `Signed ${formatDate(institution.mouSignedAt)}` : "Not recorded"}</p>
        </div>
        <div className="rounded-lg border border-borderLight bg-soft p-3">
          <p className="text-xs text-textSecondary">Developer access</p>
          <p className="mt-1 text-sm font-semibold text-primary">{institutionDeveloperRequest ? titleCase(institutionDeveloperRequest.status) : "Not requested"}</p>
        </div>
      </div>
      <ListBlock
        empty="No audit trail events for this institution yet."
        items={institutionAuditEvents.map((event) => ({
          id: event.id,
          title: event.label,
          meta: event.actorName,
          status: event.outcome,
          date: formatDate(event.createdAt)
        }))}
      />
      <div className="mt-5 border-t border-borderLight pt-4">
        <SectionTitle title="Staff Access Control" subtitle="Founder-managed Registrar, officer, and scoped access for this institution." />
        <form className="mt-4 grid gap-3" onSubmit={onInviteStaff}>
          <input className={inputClass} placeholder="Full name" value={staffInviteForm.fullName} onChange={(event) => onUpdateStaffInviteForm({ ...staffInviteForm, fullName: event.target.value })} />
          <input className={inputClass} placeholder="Email address" type="email" value={staffInviteForm.email} onChange={(event) => onUpdateStaffInviteForm({ ...staffInviteForm, email: event.target.value })} />
          <input className={inputClass} placeholder="Phone number (optional)" value={staffInviteForm.phone} onChange={(event) => onUpdateStaffInviteForm({ ...staffInviteForm, phone: event.target.value })} />
          <FilterSelect
            value={staffInviteForm.role}
            onChange={(role) => onUpdateStaffInviteForm({ ...staffInviteForm, role, permissions: (staffPermissionDefaults[role] ?? []).join(", ") })}
            options={staffRoleOptions}
          />
          <textarea
            className={`${inputClass} min-h-20`}
            placeholder="Permissions, comma separated"
            value={staffInviteForm.permissions}
            onChange={(event) => onUpdateStaffInviteForm({ ...staffInviteForm, permissions: event.target.value })}
          />
          <textarea
            className={`${inputClass} min-h-20`}
            placeholder='Assigned scopes JSON, e.g. [{"level":"SS1","subject":"Physics"}]'
            value={staffInviteForm.assignedScopes}
            onChange={(event) => onUpdateStaffInviteForm({ ...staffInviteForm, assignedScopes: event.target.value })}
          />
          <button className={primaryButtonClass} disabled={loading || !institution} type="submit">Invite Staff</button>
        </form>
        <div className="mt-4 divide-y divide-borderLight rounded-lg border border-borderLight">
          {staff.length ? staff.map((member) => (
            <div key={member.uuid} className="grid gap-3 p-3 text-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-semibold text-primary">{member.user.fullName}</p>
                  <p className="text-xs text-textSecondary">{member.user.email} / {titleCase(member.role)}</p>
                  <p className="mt-1 text-xs text-textSecondary">
                    Scopes: {member.assignedScopes.length ? member.assignedScopes.map((scope) => JSON.stringify(scope)).join(", ") : "Institution-wide"}
                  </p>
                </div>
                <StatusBadge status={member.status} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={secondaryButtonClass}
                  disabled={loading}
                  onClick={() => onUpdateStaff(member.uuid, { status: member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}
                  type="button"
                >
                  {member.status === "ACTIVE" ? "Suspend" : "Activate"}
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={loading}
                  onClick={() => onUpdateStaff(member.uuid, { twoFactorRequired: !member.twoFactorRequired })}
                  type="button"
                >
                  {member.twoFactorRequired ? "Relax TOTP Rule" : "Require TOTP"}
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={loading}
                  onClick={() => onUpdateStaff(member.uuid, { permissions: staffPermissionDefaults[member.role] ?? member.permissions })}
                  type="button"
                >
                  Reset Permissions
                </button>
              </div>
            </div>
          )) : <EmptyState text={staffLoading ? "Loading staff accounts..." : "No staff accounts found for this institution yet."} />}
        </div>
      </div>
    </Card>
  );
}

function ApplicationDetail({
  application,
  loading,
  onApprove,
  onReject,
  onRequestInfo,
  onSendEmail
}: {
  application?: InstitutionApplication;
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRequestInfo: (id: string) => void;
  onSendEmail: (id: string) => void;
}) {
  if (!application) return <Card><SectionTitle title="Application Detail" subtitle="Select an application." /><EmptyState text="No application selected." /></Card>;
  return (
    <Card>
      <SectionTitle title={application.officialName} subtitle="Submitted Institution Portal application" />
      <div className="mt-4 grid gap-3">
        <MetricLine label="Contact" value={`${application.contactPersonName} / ${application.contactEmail}`} />
        <MetricLine label="Type" value={titleCase(application.type)} />
        <MetricLine label="Address" value={application.address} />
        <MetricLine label="Student volume" value={application.studentVolume.toLocaleString()} />
        <MetricLine label="Signed MOU" value="Accepted digitally" />
        <MetricLine label="Uploaded documents" value="Stored metadata ready" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={primarySmallButtonClass} disabled={application.status !== "PENDING" || loading} onClick={() => onApprove(application.uuid)} type="button">Approve Institution</button>
        <button className={secondaryButtonClass} disabled={application.status !== "PENDING" || loading} onClick={() => onReject(application.uuid)} type="button">Reject</button>
        <button className={secondaryButtonClass} disabled={application.status !== "PENDING" || loading} onClick={() => onRequestInfo(application.uuid)} type="button">Request more info</button>
        <button className={secondaryButtonClass} disabled={loading} onClick={() => onSendEmail(application.uuid)} type="button">Send email</button>
      </div>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-borderLight bg-white p-4 shadow-sm">{children}</section>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="text-base font-semibold text-primary">{title}</h2><p className="mt-1 text-sm text-textSecondary">{subtitle}</p></div>;
}

function MetricCard({ label, value, helper, tone, icon }: { label: string; value: string | number; helper: string; tone: string; icon: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <IconTile label={icon} tone={tone} />
        <div className="min-w-0">
          <p className="truncate text-sm text-textSecondary">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{typeof value === "number" ? value.toLocaleString() : value}</p>
          <p className={`mt-2 text-xs ${tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : tone === "error" ? "text-error" : "text-textSecondary"}`}>{helper}</p>
        </div>
      </div>
    </Card>
  );
}

function ResponsiveTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead className="bg-soft text-xs uppercase text-textSecondary">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-borderLight">{row.map((cell, index) => <td key={index} className="px-4 py-3 align-top text-textPrimary">{cell}</td>)}</tr>)}</tbody>
      </table>
      {rows.length === 0 ? <EmptyState text={empty} /> : null}
    </div>
  );
}

function FilterSelect({ value, onChange, options, labels = {} }: { value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option} value={option}>{labels[option] ?? titleCase(option || "None")}</option>)}
    </select>
  );
}

function ScopePicker({ recommendedScopes = [], selected, onToggle }: { recommendedScopes?: string[]; selected: string[]; onToggle: (scope: string) => void }) {
  const recommended = new Set(recommendedScopes);
  return (
    <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
      {scopeOptions.map((scope) => {
        const isRecommended = recommended.has(scope);
        const isSelected = selected.includes(scope);
        return (
          <label key={scope} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${isRecommended ? "border-accent/40 bg-accent/5" : "border-borderLight bg-soft"}`}>
            <input checked={isSelected} onChange={() => onToggle(scope)} type="checkbox" />
            <span className="min-w-0 flex-1 break-all">{scope}</span>
            {isRecommended ? <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">{isSelected ? "Recommended" : "Suggested"}</span> : null}
          </label>
        );
      })}
    </div>
  );
}

function ListBlock({ items, empty }: { items: { id?: string; title: string; meta: string; status?: string; date?: string }[]; empty: string }) {
  if (!items.length) return <EmptyState text={empty} />;
  return <div className="mt-4 divide-y divide-borderLight">{items.map((item, index) => <div key={item.id ?? `${item.title}-${item.date ?? "no-date"}-${index}`} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-primary">{item.title}</p><p className="text-xs text-textSecondary">{item.meta}</p></div><div className="text-right">{item.status ? <StatusBadge status={item.status} /> : null}<p className="mt-1 text-xs text-textSecondary">{item.date}</p></div></div>)}</div>;
}

function SystemHealthCompact({ health }: { health: SystemHealth | null }) {
  const services = health?.services.slice(0, 5) ?? [
    { name: "API Gateway", status: "PENDING_CONFIGURATION" as HealthStatus },
    { name: "Database", status: "PENDING_CONFIGURATION" as HealthStatus },
    { name: "Authentication Service", status: "PENDING_CONFIGURATION" as HealthStatus },
    { name: "Storage Service", status: "PENDING_CONFIGURATION" as HealthStatus },
    { name: "Email Service", status: "PENDING_CONFIGURATION" as HealthStatus }
  ];
  const statusLabel = titleCase(health?.overallStatus ?? "PENDING_CONFIGURATION");
  return (
    <Card>
      <div className="flex items-center justify-between"><SectionTitle title="System Health" subtitle={health ? `Updated ${formatDate(health.generatedAt)}` : "Waiting for health data"} /><StatusBadge status={statusLabel} /></div>
      <div className="mt-4 divide-y divide-borderLight">{services.map((item) => <div key={item.name} className="flex items-center justify-between py-3 text-sm"><span>{item.name}</span><StatusBadge status={titleCase(item.status)} /></div>)}</div>
    </Card>
  );
}

function DonutSummary({ status, fallbackTotal }: { status?: DashboardSummary["institutionStatus"]; fallbackTotal: number }) {
  const active = status?.active ?? fallbackTotal;
  const pending = status?.pendingApproval ?? 0;
  const apiAccess = status?.apiAccessActive ?? 0;
  const suspended = status?.suspended ?? 0;
  const total = Math.max(status?.total ?? fallbackTotal, 1);
  const activeArc = Math.round((active / total) * 276);
  const pendingArc = Math.round((pending / total) * 276);
  const suspendedArc = Math.round((suspended / total) * 276);
  return (
    <div className="mt-4 flex items-center gap-6">
      <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" fill="none" r="44" stroke="#E5E7EB" strokeWidth="18" />
        <circle cx="60" cy="60" fill="none" r="44" stroke="#10B981" strokeDasharray={`${activeArc} 276`} strokeLinecap="round" strokeWidth="18" />
        <circle cx="60" cy="60" fill="none" r="44" stroke="#F59E0B" strokeDasharray={`${pendingArc} 276`} strokeDashoffset={-activeArc} strokeLinecap="round" strokeWidth="18" />
        <circle cx="60" cy="60" fill="none" r="44" stroke="#EF4444" strokeDasharray={`${suspendedArc} 276`} strokeDashoffset={-(activeArc + pendingArc)} strokeLinecap="round" strokeWidth="18" />
      </svg>
      <div className="flex-1 space-y-3"><MetricLine label="Active Partners" value={String(active)} /><MetricLine label="Pending Approval" value={String(pending)} /><MetricLine label="API Access Active" value={String(apiAccess)} /><MetricLine label="Suspended" value={String(suspended)} /></div>
    </div>
  );
}

function LineChart({ data = [] }: { data?: DashboardSummary["apiUsage"] }) {
  const fallback = [8, 12, 10, 18, 14, 24, 20].map((total, index) => ({ day: `D${index + 1}`, total, audit: 0, verification: total }));
  const entries = data.length ? data : fallback;
  const max = Math.max(...entries.map((entry) => entry.total), 1);
  const width = 640;
  const height = 160;
  const points = entries
    .map((entry, index) => {
      const x = entries.length === 1 ? width : (index / (entries.length - 1)) * width;
      const y = height - 20 - (entry.total / max) * 110;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const path = points.split(" ").map((point, index) => `${index === 0 ? "M" : "L"}${point}`).join(" ");
  return <svg className="my-5 h-56 w-full" preserveAspectRatio="none" viewBox="0 0 640 160"><path d={path} fill="none" stroke="#2F6BFF" strokeWidth="4" />{[30, 70, 110, 150].map((y) => <line key={y} stroke="#E5E7EB" x1="0" x2="640" y1={y} y2={y} />)}</svg>;
}

function BarChart() {
  return <div className="mt-6 flex h-48 items-end gap-4">{[44, 60, 52, 88, 72, 95, 68].map((height, index) => <div key={index} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-md bg-accent" style={{ height: `${height}%` }} /><span className="text-xs text-textSecondary">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</span></div>)}</div>;
}

function RevenueBarChart({ data, currency }: { data: RevenueOverview["daily"]; currency: string }) {
  const recent = data.slice(-7);
  const maxAmount = Math.max(...recent.map((entry) => entry.amountMinor), 1);
  if (!recent.length) {
    return <EmptyState text="No revenue events have been recorded yet." />;
  }
  return (
    <div className="mt-6 flex h-48 items-end gap-3">
      {recent.map((entry) => {
        const height = Math.max((entry.amountMinor / maxAmount) * 100, entry.amountMinor > 0 ? 8 : 2);
        return (
          <div key={entry.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-md bg-accent" title={formatMoney(entry.amountMinor, currency)} style={{ height: `${height}%` }} />
            <span className="truncate text-xs text-textSecondary">{new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(entry.day))}</span>
          </div>
        );
      })}
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-borderLight py-2 text-sm last:border-b-0"><span className="text-textSecondary">{label}</span><span className="text-right font-medium text-primary">{value}</span></div>;
}

function ToggleRow({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-md border border-borderLight bg-soft px-3 py-2 text-sm">
      <span className="font-medium text-primary">{label}</span>
      <input checked={checked} className="h-4 w-4 accent-accent" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function SecretCode({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase text-textSecondary">{label}</p><code className="mt-1 block break-all rounded-md bg-soft px-3 py-2 text-xs text-primary">{value}</code></div>;
}

function HeaderIcon({ children, label, badge }: { children: ReactNode; label: string; badge?: string }) {
  return <button className="relative hidden h-10 w-10 items-center justify-center rounded-md border border-borderLight text-primary hover:border-accent md:flex" aria-label={label} type="button">{children}{badge ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[11px] font-semibold text-white">{badge}</span> : null}</button>;
}

function IconTile({ label, tone = "accent" }: { label: string; tone?: string }) {
  const toneClass = tone === "success" ? "bg-success/10 text-success" : tone === "warning" ? "bg-warning/10 text-warning" : tone === "error" ? "bg-error/10 text-error" : "bg-accent/10 text-accent";
  return <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${toneClass}`}><SideIcon label={label} active /></div>;
}

function BrandMark({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? "justify-center" : ""}`}>
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md ${inverse ? "bg-white p-1" : ""}`}>
        <img alt="ACAD.ID mark" className="h-full w-full object-contain" src="/acadid-symbol.png" />
      </span>
      {compact ? null : <span className={`text-[18px] font-semibold tracking-normal ${inverse ? "text-white" : "text-primary"}`}>ACAD<span className="text-accent">.ID</span></span>}
    </div>
  );
}

function SideIcon({ label, active = false, inverse = false }: { label: string; active?: boolean; inverse?: boolean }) {
  const color = inverse ? "text-current" : active ? "text-accent" : "text-primary";
  return <svg className={`h-4 w-4 ${color}`} fill="none" viewBox="0 0 24 24"><path d={iconPath(label)} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

function iconPath(label: string) {
  if (label.includes("Institution")) return "M5 21V7l7-4 7 4v14M8 10h2m4 0h2M8 14h2m4 0h2M8 18h8";
  if (label.includes("API") || label.includes("Developer")) return "M15 7a4 4 0 1 1-1.4 7.75L9 19.35H6.5v-2.5l4.75-4.75A4 4 0 0 1 15 7Z";
  if (label.includes("Record")) return "M7 4h7l3 3v13H7V4Zm7 0v4h4M9 12h6M9 16h6";
  if (label.includes("Security")) return "M12 3 19 6v5c0 4.5-2.9 8.1-7 10-4.1-1.9-7-5.5-7-10V6l7-3Z";
  if (label.includes("Revenue")) return "M4 17h16M7 17V9m5 8V5m5 12v-6";
  if (label.includes("Health")) return "M4 12h4l2-5 4 10 2-5h4";
  if (label.includes("Logout")) return "M10 17l5-5-5-5M15 12H3M21 4v16";
  if (label.includes("Support")) return "M5 12a7 7 0 0 1 14 0v3a3 3 0 0 1-3 3h-2M5 12v4h3v-4H5Zm11 0v4h3v-4h-3Z";
  return "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5Z";
}

function BellIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"><path d="M15 17H9m9-2v-4a6 6 0 0 0-12 0v4l-2 2h16l-2-2ZM10 20h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

function HelpIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.9.7-1.7 1.3-1.7 2.7M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

function SearchIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"><path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>;
}

function MenuIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs text-white">{children}</span>;
}

function NoticeMessage({ notice }: { notice: Notice }) {
  const toneClass = notice.tone === "success"
    ? "border-success/20 bg-success/10 text-success"
    : notice.tone === "warning"
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-error/20 bg-error/10 text-error";
  return <div className={`rounded-md border px-3 py-2 text-sm ${toneClass}`}>{notice.text}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="mt-4 rounded-md bg-soft px-3 py-4 text-sm text-textSecondary">{text}</div>;
}

function LoadingBar() {
  return <div className="rounded-md border border-borderLight bg-white px-3 py-2 text-sm text-textSecondary">Loading latest Data Center state...</div>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const cls = normalized.includes("ACTIVE") || normalized.includes("APPROVED") || normalized.includes("CONFIRMED") || normalized.includes("OPERATIONAL") || normalized.includes("ENABLED") || normalized.includes("PAID")
    ? "bg-success/10 text-success"
    : normalized.includes("PENDING") || normalized.includes("OPEN") || normalized.includes("NOT") || normalized.includes("BILLABLE") || normalized.includes("INVOICED") || normalized.includes("TRIALING")
      ? "bg-warning/10 text-warning"
      : "bg-error/10 text-error";
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${cls}`}>{titleCase(status)}</span>;
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="block"><span className="text-sm font-medium text-primary">{label}</span><div className="mt-1">{children}</div></label>;
}

function SecretModal({ apiKey, onClose }: { apiKey: CreatedApiKey; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 px-4">
      <section className="w-full max-w-lg rounded-xl border border-borderLight bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-primary">API Key Generated</h2>
        <p className="mt-2 text-sm leading-6 text-textSecondary">{apiKey.warning}</p>
        <div className="mt-4 space-y-3"><SecretRow label="Client ID" value={apiKey.clientId} /><SecretRow label="Client Secret" value={apiKey.clientSecret} /></div>
        <button className={`${primaryButtonClass} mt-5`} onClick={onClose}>I have saved it</button>
      </section>
    </div>
  );
}

function RegistrarInviteModal({ invite, onClose }: { invite: CreatedRegistrarInvite; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 px-4">
      <section className="w-full max-w-lg rounded-xl border border-borderLight bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-primary">Registrar Invite Created</h2>
        <p className="mt-2 text-sm leading-6 text-textSecondary">{invite.warning}</p>
        <div className="mt-4 space-y-3">
          <MetricLine label="Institution" value={invite.institution.officialName} />
          <MetricLine label="Registrar" value={`${invite.registrarInvite.user.fullName} / ${invite.registrarInvite.user.email}`} />
          <MetricLine label="Expires" value={formatDate(invite.registrarInvite.inviteExpiresAt)} />
          <SecretRow label="Invite Token" value={invite.inviteToken} />
        </div>
        <button className={`${primaryButtonClass} mt-5`} onClick={onClose}>I have saved it</button>
      </section>
    </div>
  );
}

function StaffInviteModal({ invite, onClose }: { invite: CreatedStaffInvite; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 px-4">
      <section className="w-full max-w-lg rounded-xl border border-borderLight bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-primary">Staff Invite Created</h2>
        <p className="mt-2 text-sm leading-6 text-textSecondary">{invite.warning}</p>
        <div className="mt-4 space-y-3">
          <MetricLine label="Institution" value={invite.invitation.institution.officialName} />
          <MetricLine label="Staff" value={`${invite.invitation.user.fullName} / ${invite.invitation.user.email}`} />
          <MetricLine label="Role" value={titleCase(invite.invitation.role)} />
          <MetricLine label="Expires" value={formatDate(invite.invitation.inviteExpiresAt)} />
          <SecretRow label="Invite Token" value={invite.inviteToken} />
        </div>
        <button className={`${primaryButtonClass} mt-5`} onClick={onClose}>I have saved it</button>
      </section>
    </div>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return <div><p className="text-xs font-semibold uppercase text-textSecondary">{label}</p><div className="mt-1 flex gap-2"><code className="min-w-0 flex-1 break-all rounded-md bg-soft px-3 py-2 text-xs text-primary">{value}</code><button className={secondaryButtonClass} onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button></div></div>;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function parseCsv(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

function parseAssignedScopesText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error("Assigned scopes must be a JSON array.");
  }
  return parsed;
}

function initials(value: string) {
  return value.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "FA";
}

function titleCase(value: string) {
  return value.toLowerCase().replaceAll("_", " ").split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function daysSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

function formatYears(request: Pick<RecordRequest, "yearsAttendedFrom" | "yearsAttendedTo">) {
  if (request.yearsAttendedFrom && request.yearsAttendedTo) return `${request.yearsAttendedFrom}-${request.yearsAttendedTo}`;
  if (request.yearsAttendedFrom) return `From ${request.yearsAttendedFrom}`;
  if (request.yearsAttendedTo) return `Until ${request.yearsAttendedTo}`;
  return "";
}

function formatMoney(amountMinor: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const inputClass = "h-10 w-full rounded-md border border-borderLight bg-white px-3 text-sm text-textPrimary outline-none focus:border-accent";
const primaryButtonClass = "h-10 rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-primary disabled:bg-borderLight disabled:text-disabled";
const primarySmallButtonClass = "h-9 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-primary disabled:bg-borderLight disabled:text-disabled";
const secondaryButtonClass = "h-9 rounded-md border border-borderLight bg-white px-3 text-sm font-medium text-primary hover:border-accent hover:text-accent disabled:bg-borderLight disabled:text-disabled";
