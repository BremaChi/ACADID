"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_ACADID_API_URL ?? "http://localhost:4000/api";

const navItems = [
  "Overview",
  "Institutions",
  "Institution Applications",
  "API Keys",
  "Developer Access Requests",
  "Disputes",
  "Verification Logs",
  "Revenue",
  "System Health",
  "Security",
  "Settings"
] as const;

const scopeOptions = ["institution:apply", "ingest:write", "govern:write", "access:read", "verify:read", "identity:write", "webhook:manage"];
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

type PageKey = (typeof navItems)[number];

type Institution = {
  uuid: string;
  institutionId: string;
  officialName: string;
  type: string;
  state: string;
  tier: string;
  status: string;
  createdAt: string;
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

type Notice = {
  tone: "success" | "error";
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

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
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
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : JSON.stringify(data);
    throw new ApiRequestError(message, response.status);
  }
  return data as T;
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

async function loadSystemHealth(token: string): Promise<SystemHealth> {
  return apiRequest<SystemHealth>("/admin/system-health", token);
}

async function loadRevenueOverview(token: string): Promise<RevenueOverview> {
  return apiRequest<RevenueOverview>("/admin/revenue", token);
}

async function loadPlatformSettings(token: string): Promise<PlatformSettingsResponse> {
  return apiRequest<PlatformSettingsResponse>("/admin/settings", token);
}

export function FounderConsole() {
  const [activePage, setActivePage] = useState<PageKey>("Overview");
  const [token, setToken] = useState<string | null>(null);
  const [founderName, setFounderName] = useState("Founder Admin");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [email, setEmail] = useState("founder@acadid.local");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionApplications, setInstitutionApplications] = useState<InstitutionApplication[]>([]);
  const [globalApiKeys, setGlobalApiKeys] = useState<GlobalApiKey[]>([]);
  const [developerRequests, setDeveloperRequests] = useState<DeveloperAccessRequest[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [revenueOverview, setRevenueOverview] = useState<RevenueOverview | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettingsResponse | null>(null);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [selectedDisputeId, setSelectedDisputeId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [totpEnableCode, setTotpEnableCode] = useState("");
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
  const [verificationSearch, setVerificationSearch] = useState("");
  const [verificationOutcomeFilter, setVerificationOutcomeFilter] = useState("ALL");
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
  const activeKeys = globalApiKeys.filter((key) => key.status === "ACTIVE");
  const productApiKeys = globalApiKeys.filter((key) => key.ownerType === "PRODUCT");
  const institutionApiKeys = globalApiKeys.filter((key) => key.ownerType === "INSTITUTION");
  const pendingApplications = institutionApplications.filter((application) => application.status === "PENDING");
  const approvedDeveloperInstitutionIds = new Set(developerRequests.filter((request) => request.status === "APPROVED").map((request) => request.institutionId));
  const approvedDeveloperInstitutions = institutions.filter((institution) => approvedDeveloperInstitutionIds.has(institution.uuid));
  const founderInitials = initials(founderName);

  const overviewMetrics = [
    { label: "Total Institutions", value: institutions.length, helper: "Approved partners", tone: "accent", icon: "Institutions" },
    { label: "Pending Applications", value: pendingApplications.length, helper: "Needs your review", tone: "warning", icon: "Institution Applications" },
    { label: "Active Learners", value: "--", helper: "Aggregate endpoint pending", tone: "success", icon: "Overview" },
    { label: "Results Published", value: "--", helper: "Aggregate endpoint pending", tone: "warning", icon: "Verification Logs" },
    { label: "Credentials Issued", value: "--", helper: "Aggregate endpoint pending", tone: "accent", icon: "Security" },
    { label: "API Calls Today", value: "--", helper: "Gateway metrics pending", tone: "success", icon: "API Keys" }
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

  async function refreshData(activeToken = token) {
    if (!activeToken) return;
    setLoading(true);
    setNotice(null);
    try {
      const [nextInstitutions, nextGlobalKeys, nextApplications, nextDeveloperRequests, nextDisputes, nextVerificationLogs, nextSystemHealth, nextRevenueOverview, nextPlatformSettings] = await Promise.all([
        apiRequest<Institution[]>("/admin/institutions", activeToken),
        apiRequest<GlobalApiKey[]>("/admin/api-keys", activeToken),
        apiRequest<InstitutionApplication[]>("/admin/institution-applications", activeToken),
        loadDeveloperAccessRequests(activeToken),
        loadDisputes(activeToken),
        loadVerificationLogs(activeToken),
        loadSystemHealth(activeToken),
        loadRevenueOverview(activeToken),
        loadPlatformSettings(activeToken)
      ]);
      setInstitutions(nextInstitutions);
      setGlobalApiKeys(nextGlobalKeys);
      setInstitutionApplications(nextApplications);
      setDeveloperRequests(nextDeveloperRequests);
      setDisputes(nextDisputes);
      setVerificationLogs(nextVerificationLogs);
      setSystemHealth(nextSystemHealth);
      setRevenueOverview(nextRevenueOverview);
      setPlatformSettings(nextPlatformSettings);
      const approvedDeveloperInstitutionIds = new Set(nextDeveloperRequests.filter((request) => request.status === "APPROVED").map((request) => request.institutionId));
      setSelectedInstitutionId((current) => current || nextInstitutions.find((institution) => approvedDeveloperInstitutionIds.has(institution.uuid))?.uuid || nextInstitutions[0]?.uuid || "");
      setSelectedApplicationId((current) => current || nextApplications[0]?.uuid || "");
      setSelectedDisputeId((current) => current || nextDisputes[0]?.uuid || "");
    } catch (error) {
      handleAuthenticatedError(error, "Could not load console data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      const login = await apiRequest<LoginResponse>("/auth/login", null, {
        method: "POST",
        body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) })
      });
      setToken(login.accessToken);
      setFounderName(login.user.fullName);
      setMfaEnabled(login.user.mfaEnabled);
      window.localStorage.setItem("acadid_founder_token", login.accessToken);
      window.localStorage.setItem("acadid_founder_name", login.user.fullName);
      window.localStorage.setItem("acadid_founder_mfa", String(login.user.mfaEnabled));
      setPassword("");
      setTotpCode("");
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
    setInstitutionApplications([]);
    setGlobalApiKeys([]);
    setDeveloperRequests([]);
    setDisputes([]);
    setSelectedDisputeId("");
    setVerificationLogs([]);
    setSystemHealth(null);
    setRevenueOverview(null);
    setPlatformSettings(null);
    setNotice(nextNotice);
    setTotpSetup(null);
    setMfaEnabled(false);
  }

  function handleAuthenticatedError(error: unknown, fallback: string) {
    if (isSessionExpired(error)) {
      logout({ tone: "error", text: "Founder session expired. Please sign in again." });
      return;
    }
    setNotice({ tone: "error", text: error instanceof Error ? error.message : fallback });
  }

  function navigate(page: PageKey) {
    setActivePage(page);
    setDrawerOpen(false);
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

  async function approveInstitutionApplication(applicationId: string) {
    if (!token) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/institution-applications/${applicationId}/approve`, token, { method: "POST" });
      setNotice({ tone: "success", text: "Institution application approved and partner record created." });
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
            {navItems.map((item) => (
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
                {!sidebarCollapsed && item === "Institution Applications" && pendingApplications.length ? <Badge>{pendingApplications.length}</Badge> : null}
                {!sidebarCollapsed && item === "Developer Access Requests" && developerRequests.length ? <Badge>{developerRequests.length}</Badge> : null}
              </button>
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
              <PageHeading activePage={activePage} onGenerateKey={() => setActivePage("API Keys")} />
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
    </main>
  );

  function renderActivePage() {
    if (activePage === "Overview") {
      return (
        <OverviewPage
          apiKeys={globalApiKeys}
          applications={institutionApplications}
          institutions={institutions}
          metrics={overviewMetrics}
          onGenerateKey={() => setActivePage("API Keys")}
          onViewApplications={() => setActivePage("Institution Applications")}
        />
      );
    }
    if (activePage === "Institutions") {
      return (
        <InstitutionsPage
          filteredInstitutions={filteredInstitutions}
          institutionForm={institutionForm}
          institutionSearch={institutionSearch}
          institutionStateFilter={institutionStateFilter}
          institutionStatusFilter={institutionStatusFilter}
          institutionTierFilter={institutionTierFilter}
          institutionTypeFilter={institutionTypeFilter}
          institutions={institutions}
          loading={loading}
          onCreateInstitution={handleCreateInstitution}
          onSelectInstitution={setSelectedInstitutionId}
          onStateFilter={setInstitutionStateFilter}
          onStatusFilter={setInstitutionStatusFilter}
          onTierFilter={setInstitutionTierFilter}
          onTypeFilter={setInstitutionTypeFilter}
          onUpdateInstitutionForm={setInstitutionForm}
          onUpdateSearch={setInstitutionSearch}
          onUpdateStatus={updateInstitutionStatus}
          selectedInstitution={selectedInstitution}
        />
      );
    }
    if (activePage === "Institution Applications") {
      return (
        <ApplicationsPage
          applicationSearch={applicationSearch}
          applicationStatusFilter={applicationStatusFilter}
          applications={filteredApplications}
          loading={loading}
          onApprove={approveInstitutionApplication}
          onReject={rejectInstitutionApplication}
          onSelectApplication={setSelectedApplicationId}
          onStatusFilter={setApplicationStatusFilter}
          onUpdateSearch={setApplicationSearch}
          selectedApplication={selectedApplication}
        />
      );
    }
    if (activePage === "API Keys") {
      return (
        <ApiKeysPage
          apiKeyOwnerFilter={apiKeyOwnerFilter}
          apiKeySearch={apiKeySearch}
          apiKeyStatusFilter={apiKeyStatusFilter}
          approvedDeveloperInstitutions={approvedDeveloperInstitutions}
          filteredApiKeys={filteredApiKeys}
          institutionApiKeys={institutionApiKeys}
          institutionKeyForm={institutionKeyForm}
          institutions={institutions}
          loading={loading}
          onCreateInstitutionKey={handleCreateInstitutionApiKey}
          onCreateProductKey={handleCreateProductApiKey}
          onOwnerFilter={setApiKeyOwnerFilter}
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
      return <DeveloperRequestsPage loading={loading} onUpdate={updateDeveloperAccessRequest} requests={filteredDeveloperRequests} statusFilter={developerStatusFilter} onStatusFilter={setDeveloperStatusFilter} />;
    }
    if (activePage === "Disputes") {
      return (
        <DisputesPage
          disputes={filteredDisputes}
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
    if (activePage === "Verification Logs") {
      return (
        <VerificationLogsPage
          allLogs={verificationLogs}
          logs={filteredVerificationLogs}
          onOutcomeFilter={setVerificationOutcomeFilter}
          onSearch={setVerificationSearch}
          outcomeFilter={verificationOutcomeFilter}
          search={verificationSearch}
        />
      );
    }
    if (activePage === "Revenue") {
      return <RevenuePage revenue={revenueOverview} />;
    }
    if (activePage === "System Health") {
      return <SystemHealthPage health={systemHealth} />;
    }
    if (activePage === "Security") {
      return (
        <SecurityPage
          loading={loading}
          mfaEnabled={mfaEnabled}
          onEnableTotp={handleEnableTotp}
          onSetupTotp={handleSetupTotp}
          setTotpEnableCode={setTotpEnableCode}
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
  institutions,
  metrics,
  onGenerateKey,
  onViewApplications
}: {
  apiKeys: GlobalApiKey[];
  applications: InstitutionApplication[];
  institutions: Institution[];
  metrics: { label: string; value: string | number; helper: string; tone: string; icon: string }[];
  onGenerateKey: () => void;
  onViewApplications: () => void;
}) {
  const recentApplications = applications.slice(0, 5);
  const latestEvents = [
    { label: "New institution application submitted", meta: recentApplications[0]?.officialName ?? "Waiting for portal submissions", time: "Live" },
    { label: "API key generated", meta: apiKeys[0]?.ownerLabel ?? "No API keys yet", time: apiKeys[0] ? formatDate(apiKeys[0].createdAt) : "Empty" },
    { label: "Institution approved", meta: institutions[0]?.officialName ?? "No partner yet", time: institutions[0] ? formatDate(institutions[0].createdAt) : "Empty" }
  ];

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
          <LineChart />
          <div className="grid gap-3 md:grid-cols-4">
            {["Institution Portal", "Student App", "Verification Portal", "Exam Bodies"].map((label, index) => (
              <div key={label} className="rounded-lg border border-borderLight bg-white p-3">
                <p className="text-xs text-textSecondary">{label}</p>
                <p className="mt-1 text-lg font-semibold text-primary">{["642K", "321K", "198K", "82K"][index]}</p>
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
          <DonutSummary total={institutions.length} />
        </Card>
        <Card>
          <SectionTitle title="Latest Audit Events" subtitle="Recent control-plane activity" />
          <ListBlock empty="No audit events connected yet." items={latestEvents.map((event) => ({ title: event.label, meta: event.meta, date: event.time }))} />
        </Card>
        <SystemHealthCompact />
      </div>
    </div>
  );
}

function InstitutionsPage(props: {
  filteredInstitutions: Institution[];
  institutionForm: { officialName: string; type: string; state: string; tier: string };
  institutionSearch: string;
  institutionStateFilter: string;
  institutionStatusFilter: string;
  institutionTierFilter: string;
  institutionTypeFilter: string;
  institutions: Institution[];
  loading: boolean;
  onCreateInstitution: (event: FormEvent<HTMLFormElement>) => void;
  onSelectInstitution: (id: string) => void;
  onStateFilter: (value: string) => void;
  onStatusFilter: (value: string) => void;
  onTierFilter: (value: string) => void;
  onTypeFilter: (value: string) => void;
  onUpdateInstitutionForm: (value: { officialName: string; type: string; state: string; tier: string }) => void;
  onUpdateSearch: (value: string) => void;
  onUpdateStatus: (id: string, status: "ACTIVE" | "SUSPENDED") => void;
  selectedInstitution?: Institution;
}) {
  const states = uniqueValues(props.institutions.map((institution) => institution.state));
  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
      <Card>
        <SectionTitle title="Institutions" subtitle="Approved and active AcadID partners." />
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input className={`${inputClass} md:col-span-2`} placeholder="Search institutions" value={props.institutionSearch} onChange={(event) => props.onUpdateSearch(event.target.value)} />
          <FilterSelect value={props.institutionTypeFilter} onChange={props.onTypeFilter} options={["ALL", "PRIMARY", "SECONDARY", "TERTIARY", "EXAM_BODY"]} />
          <FilterSelect value={props.institutionStateFilter} onChange={props.onStateFilter} options={["ALL", ...states]} />
          <FilterSelect value={props.institutionStatusFilter} onChange={props.onStatusFilter} options={["ALL", "ACTIVE", "SUSPENDED"]} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <FilterSelect value={props.institutionTierFilter} onChange={props.onTierFilter} options={["ALL", "FOUNDING", "ACTIVE", "VERIFIED"]} />
          <div className="rounded-md border border-borderLight bg-soft px-3 py-2 text-sm text-textSecondary">
            Supported types: {institutionTypeOptions.slice(0, 4).join(", ")} and more
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
              <FilterSelect value={props.institutionForm.type} onChange={(type) => props.onUpdateInstitutionForm({ ...props.institutionForm, type })} options={["PRIMARY", "SECONDARY", "TERTIARY", "EXAM_BODY"]} />
              <input className={inputClass} placeholder="State" value={props.institutionForm.state} onChange={(event) => props.onUpdateInstitutionForm({ ...props.institutionForm, state: event.target.value })} />
            </div>
            <FilterSelect value={props.institutionForm.tier} onChange={(tier) => props.onUpdateInstitutionForm({ ...props.institutionForm, tier })} options={["FOUNDING", "ACTIVE", "VERIFIED"]} />
            <button className={primaryButtonClass} disabled={props.loading}>Create Institution</button>
          </form>
        </Card>
        <InstitutionDetail institution={props.selectedInstitution} />
      </div>
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
      <ApplicationDetail application={props.selectedApplication} onApprove={props.onApprove} onReject={props.onReject} loading={props.loading} />
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
              <button className={secondaryButtonClass} disabled type="button">Regenerate</button>
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
        <div className="mt-4 flex gap-2"><button className={secondaryButtonClass} disabled={!revenue?.recentEntries.length} onClick={exportCsv} type="button">Export CSV</button><button className={secondaryButtonClass} disabled type="button">Export PDF</button></div>
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

function SystemHealthPage({ health }: { health: SystemHealth | null }) {
  const metrics = health?.metrics;
  const services = health?.services ?? [
    { name: "API Gateway", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Database", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Authentication Service", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Storage Service", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Email Service", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." },
    { name: "Webhook Delivery", status: "PENDING_CONFIGURATION" as HealthStatus, responseTimeMs: 0, message: "Waiting for health endpoint data." }
  ];
  const incidents = health?.incidents ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Overall Status" value={titleCase(health?.overallStatus ?? "PENDING_CONFIGURATION")} helper={health ? `Updated ${formatDate(health.generatedAt)}` : "Waiting for health data"} tone={health?.overallStatus === "OPERATIONAL" ? "success" : health?.overallStatus === "DOWN" ? "error" : "warning"} icon="System Health" />
        <MetricCard label="Gateway Requests" value={metrics?.gatewayRequestsToday ?? "--"} helper="Last 24 hours" tone="accent" icon="API Keys" />
        <MetricCard label="Error Rate" value={typeof metrics?.errorRate === "number" ? `${metrics.errorRate}%` : "--"} helper="Denied, revoked, discrepancy, failed audit" tone={metrics && metrics.errorRate > 0 ? "warning" : "success"} icon="Security" />
        <MetricCard label="Uptime" value={health ? formatDuration(health.uptimeSeconds) : "--"} helper="Current API process" tone="accent" icon="System Health" />
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
          <MetricLine label="Recent incidents" value={`${incidents.length} open`} />
        </div>
      </Card>
      </div>
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
  loading: boolean;
  mfaEnabled: boolean;
  onEnableTotp: (event: FormEvent<HTMLFormElement>) => void;
  onSetupTotp: () => void;
  setTotpEnableCode: (value: string) => void;
  totpEnableCode: string;
  totpSetup: TotpSetup | null;
}) {
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
        <SectionTitle title="Security Operations" subtitle="Login history and session management endpoints pending." />
        <div className="mt-4 grid gap-3">
          {["Login history", "Session management", "API key security logs", "Founder audit logs"].map((item) => <PlaceholderRow key={item} label={item} />)}
          <button className="h-10 rounded-md border border-error px-4 text-sm font-medium text-error" type="button">Emergency lockdown</button>
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

function PageHeading({ activePage, onGenerateKey }: { activePage: PageKey; onGenerateKey: () => void }) {
  const subtitle =
    activePage === "Overview"
      ? "Here's what's happening across ACAD.ID infrastructure today."
      : `${activePage} operations and control workflows.`;
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold leading-tight text-primary">{activePage === "Overview" ? "Welcome back, Founder" : activePage}</h1>
        <p className="mt-1 text-sm text-textSecondary">{subtitle}</p>
      </div>
      <button className={`${primaryButtonClass} w-full md:w-auto`} onClick={onGenerateKey} type="button">+ Generate API Key</button>
    </div>
  );
}

function InstitutionDetail({ institution }: { institution?: Institution }) {
  if (!institution) return <Card><SectionTitle title="Institution Details" subtitle="Select an institution." /><EmptyState text="No institution selected." /></Card>;
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
      <div className="mt-4 grid gap-2 text-sm text-textSecondary">
        {["Staff", "Learners", "Results", "API status", "MOU", "Audit trail"].map((item) => <PlaceholderRow key={item} label={`View ${item}`} />)}
      </div>
    </Card>
  );
}

function ApplicationDetail({ application, loading, onApprove, onReject }: { application?: InstitutionApplication; loading: boolean; onApprove: (id: string) => void; onReject: (id: string) => void }) {
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
        <button className={secondaryButtonClass} disabled type="button">Request more info</button>
        <button className={secondaryButtonClass} disabled type="button">Send email</button>
      </div>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-xl border border-borderLight bg-white p-4 shadow-sm">{children}</section>;
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

function ListBlock({ items, empty }: { items: { title: string; meta: string; status?: string; date?: string }[]; empty: string }) {
  if (!items.length) return <EmptyState text={empty} />;
  return <div className="mt-4 divide-y divide-borderLight">{items.map((item) => <div key={`${item.title}-${item.date}`} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-primary">{item.title}</p><p className="text-xs text-textSecondary">{item.meta}</p></div><div className="text-right">{item.status ? <StatusBadge status={item.status} /> : null}<p className="mt-1 text-xs text-textSecondary">{item.date}</p></div></div>)}</div>;
}

function SystemHealthCompact() {
  return (
    <Card>
      <div className="flex items-center justify-between"><SectionTitle title="System Health" subtitle="All systems operational" /><span className="text-sm text-success">Operational</span></div>
      <div className="mt-4 divide-y divide-borderLight">{["API Gateway", "Database", "Authentication Service", "Storage Service", "Email Service"].map((item) => <div key={item} className="flex items-center justify-between py-3 text-sm"><span>{item}</span><StatusBadge status="Operational" /></div>)}</div>
    </Card>
  );
}

function DonutSummary({ total }: { total: number }) {
  const safeTotal = Math.max(total, 1);
  return (
    <div className="mt-4 flex items-center gap-6">
      <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120"><circle cx="60" cy="60" fill="none" r="44" stroke="#E5E7EB" strokeWidth="18" /><circle cx="60" cy="60" fill="none" r="44" stroke="#10B981" strokeDasharray={`${safeTotal ? 210 : 0} 276`} strokeLinecap="round" strokeWidth="18" /></svg>
      <div className="flex-1 space-y-3"><MetricLine label="Active Partners" value={String(total)} /><MetricLine label="Pending Approval" value="0" /><MetricLine label="API Access Active" value="Pending" /><MetricLine label="Suspended" value="0" /></div>
    </div>
  );
}

function LineChart() {
  const points = "0,120 90,125 180,95 270,70 360,84 450,60 540,22 640,44";
  return <svg className="my-5 h-56 w-full" preserveAspectRatio="none" viewBox="0 0 640 160"><path d="M0 120 L90 125 L180 95 L270 70 L360 84 L450 60 L540 22 L640 44" fill="none" stroke="#2F6BFF" strokeWidth="4" /><polyline fill="none" points={points} stroke="#2F6BFF" strokeWidth="0" />{[30, 70, 110, 150].map((y) => <line key={y} stroke="#E5E7EB" x1="0" x2="640" y1={y} y2={y} />)}</svg>;
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

function PlaceholderRow({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed border-borderLight bg-soft px-3 py-2 text-sm text-textSecondary">{label} - backend integration pending</div>;
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
  return <div className={`rounded-md border px-3 py-2 text-sm ${notice.tone === "success" ? "border-success/20 bg-success/10 text-success" : "border-error/20 bg-error/10 text-error"}`}>{notice.text}</div>;
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

function initials(value: string) {
  return value.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "FA";
}

function titleCase(value: string) {
  return value.toLowerCase().replaceAll("_", " ").split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatMoney(amountMinor: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
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
