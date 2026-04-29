"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_ACADID_API_URL ?? "http://localhost:4000/api";
const navItems = ["Overview", "Applications", "Institutions", "API Keys", "Disputes", "Reports", "Security"];
const scopeOptions = ["institution:apply", "ingest:write", "govern:write", "access:read", "verify:read", "identity:write", "webhook:manage"];
const productOptions = [
  { code: "INSTITUTION_PORTAL", name: "Institution Portal" },
  { code: "STUDENT_APP", name: "Student Mobile App" },
  { code: "EMPLOYER_VERIFICATION_PORTAL", name: "Employer Verification Portal" },
  { code: "EXAM_BODY_API", name: "Exam Body API" }
];

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
    throw new Error(message);
  }
  return data as T;
}

export function FounderConsole() {
  const [token, setToken] = useState<string | null>(null);
  const [founderName, setFounderName] = useState("Founder");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [email, setEmail] = useState("founder@acadid.local");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionApplications, setInstitutionApplications] = useState<InstitutionApplication[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, ApiKey[]>>({});
  const [globalApiKeys, setGlobalApiKeys] = useState<GlobalApiKey[]>([]);
  const [apiKeySearch, setApiKeySearch] = useState("");
  const [apiKeyStatusFilter, setApiKeyStatusFilter] = useState("ALL");
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [totpEnableCode, setTotpEnableCode] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [institutionForm, setInstitutionForm] = useState({
    officialName: "",
    type: "SECONDARY",
    state: "Lagos",
    tier: "ACTIVE"
  });
  const [authorityForm, setAuthorityForm] = useState({
    signedByName: "",
    signedByTitle: "Registrar",
    effectiveFrom: new Date().toISOString().slice(0, 10)
  });
  const [keyForm, setKeyForm] = useState({
    label: "Institution Portal - Sandbox",
    environment: "SANDBOX" as "SANDBOX" | "PRODUCTION",
    rateLimitPerMinute: 500,
    scopes: ["ingest:write", "govern:write", "verify:read"]
  });
  const [productKeyForm, setProductKeyForm] = useState({
    productCode: "INSTITUTION_PORTAL",
    productName: "Institution Portal",
    label: "Institution Portal Backend - Sandbox",
    environment: "SANDBOX" as "SANDBOX" | "PRODUCTION",
    rateLimitPerMinute: 1000,
    scopes: ["institution:apply"]
  });

  const selectedInstitution = institutions.find((institution) => institution.uuid === selectedInstitutionId);
  const selectedKeys = selectedInstitutionId ? apiKeys[selectedInstitutionId] ?? [] : [];
  const pendingApplications = institutionApplications.filter((application) => application.status === "PENDING");
  const activeKeys = globalApiKeys.filter((key) => key.status === "ACTIVE");
  const filteredGlobalApiKeys = useMemo(() => {
    const term = apiKeySearch.trim().toLowerCase();
    return globalApiKeys.filter((key) => {
      const statusMatches = apiKeyStatusFilter === "ALL" || key.status === apiKeyStatusFilter;
      const termMatches =
        !term ||
        key.label.toLowerCase().includes(term) ||
        key.clientId.toLowerCase().includes(term) ||
        (key.ownerLabel ?? "").toLowerCase().includes(term) ||
        (key.ownerReference ?? "").toLowerCase().includes(term) ||
        (key.institutionName ?? "").toLowerCase().includes(term) ||
        (key.institutionDisplayId ?? "").toLowerCase().includes(term);
      return statusMatches && termMatches;
    });
  }, [apiKeySearch, apiKeyStatusFilter, globalApiKeys]);

  const metrics = useMemo(
    () => [
      { label: "Institutions", value: institutions.length.toString(), helper: "Total connected", icon: "building" },
      { label: "API Keys", value: activeKeys.length.toString(), helper: "Active keys", icon: "key" },
      { label: "Database", value: "Live", helper: "Supabase PostgreSQL", icon: "database" },
      { label: "Gateway", value: "Scoped", helper: "Auth/Token enabled", icon: "shield" }
    ],
    [activeKeys.length, institutions.length]
  );
  const recentInstitutions = institutions.slice(0, 5);
  const revokedKeys = globalApiKeys.filter((key) => key.status === "REVOKED").length;
  const expiredKeys = globalApiKeys.filter((key) => key.status === "EXPIRED").length;
  const inactiveKeys = globalApiKeys.filter((key) => !["ACTIVE", "REVOKED", "EXPIRED"].includes(key.status)).length;
  const founderInitials = founderName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    const savedToken = window.localStorage.getItem("acadid_founder_token");
    const savedName = window.localStorage.getItem("acadid_founder_name");
    const savedMfa = window.localStorage.getItem("acadid_founder_mfa");
    if (savedToken) {
      setToken(savedToken);
      setFounderName(savedName ?? "Founder");
      setMfaEnabled(savedMfa === "true");
      void refreshData(savedToken);
    }
  }, []);

  async function refreshData(activeToken = token) {
    if (!activeToken) {
      return;
    }
    setLoading(true);
    try {
      const [nextInstitutions, nextGlobalKeys, nextApplications] = await Promise.all([
        apiRequest<Institution[]>("/admin/institutions", activeToken),
        apiRequest<GlobalApiKey[]>("/admin/api-keys", activeToken),
        apiRequest<InstitutionApplication[]>("/admin/institution-applications", activeToken)
      ]);
      const nextKeyEntries = nextGlobalKeys.reduce<Record<string, ApiKey[]>>((groups, key) => {
        if (key.institutionUuid) {
          groups[key.institutionUuid] = [...(groups[key.institutionUuid] ?? []), key];
        }
        return groups;
      }, {});
      setInstitutions(nextInstitutions);
      setGlobalApiKeys(nextGlobalKeys);
      setInstitutionApplications(nextApplications);
      setApiKeys(nextKeyEntries);
      setSelectedInstitutionId((current) => current || nextInstitutions[0]?.uuid || "");
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load console data." });
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

  function logout() {
    window.localStorage.removeItem("acadid_founder_token");
    window.localStorage.removeItem("acadid_founder_name");
    window.localStorage.removeItem("acadid_founder_mfa");
    setToken(null);
    setInstitutions([]);
    setInstitutionApplications([]);
    setApiKeys({});
    setGlobalApiKeys([]);
    setApiKeySearch("");
    setApiKeyStatusFilter("ALL");
    setSelectedInstitutionId("");
    setNotice(null);
    setTotpSetup(null);
    setMfaEnabled(false);
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
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not start TOTP setup." });
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
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not enable TOTP." });
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
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Institution creation failed." });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAuthorityGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedInstitutionId) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/institutions/${selectedInstitutionId}/authority-grants`, token, {
        method: "POST",
        body: JSON.stringify({
          ...authorityForm,
          permissions: { all: true }
        })
      });
      setNotice({ tone: "success", text: "Authority Grant activated." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Authority Grant creation failed." });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedInstitutionId) return;
    setLoading(true);
    try {
      const apiKey = await apiRequest<CreatedApiKey>(`/admin/institutions/${selectedInstitutionId}/api-keys`, token, {
        method: "POST",
        body: JSON.stringify(keyForm)
      });
      setCreatedKey(apiKey);
      setNotice({ tone: "success", text: "API key generated. Save the secret now." });
      await refreshData();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "API key generation failed." });
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
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Product API key generation failed." });
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
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Application approval failed." });
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
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Application rejection failed." });
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
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "API key revocation failed." });
    } finally {
      setLoading(false);
    }
  }

  function toggleScope(scope: string) {
    const scopes = keyForm.scopes.includes(scope)
      ? keyForm.scopes.filter((item) => item !== scope)
      : [...keyForm.scopes, scope];
    setKeyForm({ ...keyForm, scopes });
  }

  function toggleProductScope(scope: string) {
    const scopes = productKeyForm.scopes.includes(scope)
      ? productKeyForm.scopes.filter((item) => item !== scope)
      : [...productKeyForm.scopes, scope];
    setProductKeyForm({ ...productKeyForm, scopes });
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-bgMain px-4 py-8 text-textPrimary">
        <section className="mx-auto max-w-md rounded-lg border border-borderLight bg-white p-6 shadow-sm">
          <BrandMark />
          <h1 className="mt-2 text-2xl font-semibold">Founder Console</h1>
          <p className="mt-2 text-sm leading-6 text-textSecondary">Sign in to manage institutions, Authority Grants, and API keys.</p>
          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <label className="block">
              <span className="text-sm font-medium text-textPrimary">Email</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-textPrimary">Password</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-textPrimary">Authenticator code</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                inputMode="numeric"
                placeholder="Required after TOTP is enabled"
              />
            </label>
            <button className="h-11 w-full rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-primary disabled:bg-borderLight disabled:text-disabled" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          {notice ? <NoticeMessage notice={notice} /> : <EmptyState text="No active founder session." />}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bgMain text-textPrimary">
      <div className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:gap-6 lg:py-6">
        <aside
          className={`rounded-lg border border-borderLight bg-white shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-48px)] ${
            sidebarCollapsed ? "lg:w-20" : "lg:w-64"
          }`}
        >
          <div className={`flex items-center justify-between border-b border-borderLight p-5 ${sidebarCollapsed ? "lg:justify-center lg:p-4" : ""}`}>
            <BrandMark compact={sidebarCollapsed} />
            <button
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`hidden h-8 w-8 items-center justify-center rounded-md border border-borderLight text-primary hover:border-accent hover:text-accent lg:flex ${
                sidebarCollapsed ? "lg:absolute lg:right-2 lg:top-4" : ""
              }`}
              onClick={() => setSidebarCollapsed((current) => !current)}
              type="button"
            >
              <SidebarToggleIcon collapsed={sidebarCollapsed} />
            </button>
            <details className="lg:hidden">
              <summary className="cursor-pointer rounded-md border border-borderLight px-3 py-2 text-sm font-medium text-textPrimary">
                Menu
              </summary>
              <nav className="absolute left-4 right-4 z-10 mt-3 rounded-lg border border-borderLight bg-white p-2 shadow-sm">
                {navItems.map((item) => (
                  <a key={item} className="block rounded-md px-3 py-2 text-sm text-textPrimary" href={`#${slug(item)}`}>
                    {item}
                  </a>
                ))}
              </nav>
            </details>
          </div>
          <nav className="hidden p-3 lg:block">
            {navItems.map((item) => (
              <a
                key={item}
                className={`mb-1 flex items-center rounded-md px-3 py-3 text-sm font-medium ${
                  item === "Overview" ? "bg-soft text-accent" : "text-primary hover:bg-soft"
                } ${sidebarCollapsed ? "justify-center" : "gap-3"}`}
                href={`#${slug(item)}`}
                title={sidebarCollapsed ? item : undefined}
              >
                <SideIcon label={item} active={item === "Overview"} />
                {sidebarCollapsed ? null : item}
              </a>
            ))}
          </nav>
          <div className={`hidden border-t border-borderLight lg:block ${sidebarCollapsed ? "space-y-3 p-3" : "space-y-4 p-4"}`}>
            <div className={`rounded-lg border border-borderLight bg-white shadow-sm ${sidebarCollapsed ? "p-2" : "p-4"}`}>
              <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white">
                  <SideIcon label="Security" active />
                </div>
                {sidebarCollapsed ? null : (
                  <div>
                    <p className="text-sm font-medium text-primary">Founder Console</p>
                    <p className="text-xs text-textSecondary">Super Admin</p>
                  </div>
                )}
              </div>
            </div>
            {sidebarCollapsed ? null : (
              <div className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-primary">Quick Actions</p>
                <div className="mt-3 space-y-2">
                  <QuickActionButton label="Add Institution" target="institutions" />
                  <QuickActionButton label="Generate API Key" target="api-keys" />
                  <QuickActionButton label="View Reports" target="reports" />
                </div>
              </div>
            )}
            <button
              className={`flex h-10 items-center rounded-md px-3 text-sm font-medium text-primary hover:bg-soft ${sidebarCollapsed ? "w-full justify-center" : "gap-3"}`}
              onClick={logout}
              title={sidebarCollapsed ? "Logout" : undefined}
            >
              <SideIcon label="Logout" />
              {sidebarCollapsed ? null : "Logout"}
            </button>
          </div>
        </aside>

        <section className="flex-1 space-y-5">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <span className="pointer-events-none absolute left-4 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-accent" />
              <input
                className="h-12 w-full rounded-lg border border-borderLight bg-white pl-10 pr-4 text-sm text-textPrimary outline-none shadow-sm focus:border-accent"
                placeholder="Search institutions, keys..."
                value={apiKeySearch}
                onChange={(event) => setApiKeySearch(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <button className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-borderLight bg-white text-primary shadow-sm hover:border-accent hover:text-accent" aria-label="Notifications" type="button">
                <BellIcon />
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">
                  3
                </span>
              </button>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{founderInitials || "FA"}</div>
              <button
                className="h-11 rounded-md bg-accent px-5 text-sm font-medium text-white shadow-sm hover:bg-primary disabled:bg-borderLight disabled:text-disabled"
                onClick={() => document.getElementById("institutions")?.scrollIntoView({ behavior: "smooth" })}
              >
                Add Institution
              </button>
            </div>
          </header>

          {notice ? <NoticeMessage notice={notice} /> : null}

          <section id="overview" className="space-y-5">
            <div>
              <h1 className="text-[24px] font-semibold leading-tight text-primary">Welcome back, Founder Admin</h1>
              <p className="mt-2 text-sm leading-6 text-textSecondary">Here is what is happening with your ACAD.ID infrastructure.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <article key={metric.label} className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <IconTile name={metric.icon} />
                    <div>
                      <p className="text-sm font-medium text-textSecondary">{metric.label}</p>
                      <p className="mt-1 text-[28px] font-semibold leading-none text-primary">{metric.value}</p>
                      <p className="mt-2 text-xs text-textSecondary">{metric.helper}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <section className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
              <OverviewChart institutionCount={institutions.length} />
              <RecentInstitutions institutions={recentInstitutions} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr_0.8fr]">
              <ApiUsageDonut active={activeKeys.length} revoked={revokedKeys} expired={expiredKeys} inactive={inactiveKeys} />
              <ApiRequestBars />
              <SystemHealth />
            </section>
          </section>

          <section id="applications" className="rounded-lg border border-borderLight bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-borderLight p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-textPrimary">Institution Applications</h2>
                <p className="mt-1 text-sm text-textSecondary">Founder approval queue for institutions joining through the Institution Portal.</p>
              </div>
              <span className="rounded-full bg-soft px-3 py-1 text-xs font-semibold text-primary">{pendingApplications.length} pending</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="bg-soft text-xs uppercase text-textSecondary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Institution</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Volume</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Submitted</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {institutionApplications.map((application) => (
                    <tr key={application.uuid} className="border-t border-borderLight">
                      <td className="px-4 py-3">
                        <p className="font-medium text-textPrimary">{application.officialName}</p>
                        <p className="text-xs text-textSecondary">
                          {titleCase(application.type)} / {application.state}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-textPrimary">{application.contactPersonName}</p>
                        <p className="text-xs text-textSecondary">{application.contactEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-textPrimary">{application.studentVolume.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={application.status} />
                      </td>
                      <td className="px-4 py-3 text-textPrimary">{formatDate(application.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-white disabled:bg-borderLight disabled:text-disabled"
                            disabled={application.status !== "PENDING" || loading}
                            onClick={() => void approveInstitutionApplication(application.uuid)}
                          >
                            Approve
                          </button>
                          <button
                            className="h-9 rounded-md border border-borderLight px-3 text-sm font-medium text-primary disabled:bg-borderLight disabled:text-disabled"
                            disabled={application.status !== "PENDING" || loading}
                            onClick={() => void rejectInstitutionApplication(application.uuid)}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {institutionApplications.length === 0 ? <EmptyState text="No institution applications yet. Portal submissions will appear here for Founder approval." /> : null}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
            <article id="institutions" className="rounded-lg border border-borderLight bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-borderLight p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-textPrimary">Institution Management</h2>
                  <p className="mt-1 text-sm text-textSecondary">Create institutions and select one for authority/key actions.</p>
                </div>
                <button className="h-10 rounded-md border border-accent px-4 text-sm font-medium text-accent hover:bg-soft disabled:border-borderLight disabled:text-disabled" onClick={() => void refreshData()}>
                  Refresh
                </button>
              </div>

              <form className="grid gap-3 border-b border-borderLight p-4 md:grid-cols-[1fr_150px_120px_120px_auto]" onSubmit={handleCreateInstitution}>
                <input
                  className="h-10 rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                  placeholder="Institution official name"
                  value={institutionForm.officialName}
                  onChange={(event) => setInstitutionForm({ ...institutionForm, officialName: event.target.value })}
                />
                <select
                  className="h-10 rounded-md border border-borderLight px-3 text-sm text-textPrimary outline-none focus:border-accent"
                  value={institutionForm.type}
                  onChange={(event) => setInstitutionForm({ ...institutionForm, type: event.target.value })}
                >
                  <option value="PRIMARY">Primary</option>
                  <option value="SECONDARY">Secondary</option>
                  <option value="TERTIARY">Tertiary</option>
                  <option value="EXAM_BODY">Exam body</option>
                </select>
                <input
                  className="h-10 rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                  placeholder="State"
                  value={institutionForm.state}
                  onChange={(event) => setInstitutionForm({ ...institutionForm, state: event.target.value })}
                />
                <select
                  className="h-10 rounded-md border border-borderLight px-3 text-sm text-textPrimary outline-none focus:border-accent"
                  value={institutionForm.tier}
                  onChange={(event) => setInstitutionForm({ ...institutionForm, tier: event.target.value })}
                >
                  <option value="FOUNDING">Founding</option>
                  <option value="ACTIVE">Active</option>
                  <option value="VERIFIED">Verified</option>
                </select>
                <button className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-primary disabled:bg-borderLight disabled:text-disabled" disabled={loading}>
                  Create
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-soft text-xs uppercase text-textSecondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Institution</th>
                      <th className="px-4 py-3 font-semibold">State</th>
                      <th className="px-4 py-3 font-semibold">Tier</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Keys</th>
                    </tr>
                  </thead>
                  <tbody>
                    {institutions.map((institution) => (
                      <tr
                        key={institution.uuid}
                        className={`cursor-pointer border-t border-borderLight ${institution.uuid === selectedInstitutionId ? "bg-soft" : "hover:bg-soft"}`}
                        onClick={() => setSelectedInstitutionId(institution.uuid)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-textPrimary">{institution.officialName}</p>
                          <p className="text-xs text-textSecondary">{institution.institutionId}</p>
                        </td>
                        <td className="px-4 py-3 text-textPrimary">{institution.state}</td>
                        <td className="px-4 py-3 text-textPrimary">{titleCase(institution.tier)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={institution.status} />
                        </td>
                        <td className="px-4 py-3 text-textPrimary">{apiKeys[institution.uuid]?.length ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {institutions.length === 0 ? <EmptyState text="No institutions yet. Create the first institution above." /> : null}
              </div>
            </article>

            <aside id="api-keys" className="space-y-4">
              <article className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-textPrimary">Selected Institution</h2>
                {selectedInstitution ? (
                  <div className="mt-3 rounded-md bg-soft p-3 text-sm text-textPrimary">
                    <p className="font-medium text-textPrimary">{selectedInstitution.officialName}</p>
                    <p className="mt-1">{selectedInstitution.institutionId}</p>
                  </div>
                ) : (
                  <EmptyState text="Select or create an institution." />
                )}
              </article>

              <article className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-textPrimary">Authority Grant</h2>
                <form className="mt-4 space-y-3" onSubmit={handleCreateAuthorityGrant}>
                  <input
                    className="h-10 w-full rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                    placeholder="Signed by name"
                    value={authorityForm.signedByName}
                    onChange={(event) => setAuthorityForm({ ...authorityForm, signedByName: event.target.value })}
                  />
                  <input
                    className="h-10 w-full rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                    placeholder="Signed by title"
                    value={authorityForm.signedByTitle}
                    onChange={(event) => setAuthorityForm({ ...authorityForm, signedByTitle: event.target.value })}
                  />
                  <input
                    className="h-10 w-full rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                    type="date"
                    value={authorityForm.effectiveFrom}
                    onChange={(event) => setAuthorityForm({ ...authorityForm, effectiveFrom: event.target.value })}
                  />
                  <button className="h-10 w-full rounded-md border border-accent px-4 text-sm font-medium text-accent hover:bg-soft disabled:border-borderLight disabled:text-disabled" disabled={loading || !selectedInstitutionId}>
                    Activate Authority
                  </button>
                </form>
              </article>

              <article className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-textPrimary">Product API Key</h2>
                <p className="mt-1 text-sm text-textSecondary">MVP keys belong to ACAD.ID products, not institutions.</p>
                <form className="mt-4 space-y-3" onSubmit={handleCreateProductApiKey}>
                  <select
                    className="h-10 w-full rounded-md border border-borderLight px-3 text-sm text-textPrimary outline-none focus:border-accent"
                    value={productKeyForm.productCode}
                    onChange={(event) => {
                      const product = productOptions.find((option) => option.code === event.target.value) ?? productOptions[0];
                      setProductKeyForm({ ...productKeyForm, productCode: product.code, productName: product.name, label: `${product.name} Backend - Sandbox` });
                    }}
                  >
                    {productOptions.map((product) => (
                      <option key={product.code} value={product.code}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="h-10 w-full rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                    placeholder="Product key label"
                    value={productKeyForm.label}
                    onChange={(event) => setProductKeyForm({ ...productKeyForm, label: event.target.value })}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      className="h-10 rounded-md border border-borderLight px-3 text-sm text-textPrimary outline-none focus:border-accent"
                      value={productKeyForm.environment}
                      onChange={(event) => setProductKeyForm({ ...productKeyForm, environment: event.target.value as "SANDBOX" | "PRODUCTION" })}
                    >
                      <option value="SANDBOX">Sandbox</option>
                      <option value="PRODUCTION">Production</option>
                    </select>
                    <input
                      className="h-10 rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                      type="number"
                      min={1}
                      max={10000}
                      value={productKeyForm.rateLimitPerMinute}
                      onChange={(event) => setProductKeyForm({ ...productKeyForm, rateLimitPerMinute: Number(event.target.value) })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-textPrimary">
                    {scopeOptions.map((scope) => (
                      <label key={scope} className="flex items-center gap-2 rounded-md border border-borderLight bg-soft px-3 py-2">
                        <input checked={productKeyForm.scopes.includes(scope)} onChange={() => toggleProductScope(scope)} type="checkbox" />
                        <span className="break-all">{scope}</span>
                      </label>
                    ))}
                  </div>
                  <button className="h-10 w-full rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-primary disabled:bg-borderLight disabled:text-disabled" disabled={loading}>
                    Generate Product Key
                  </button>
                </form>
              </article>

              <article className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-textPrimary">Institution API Key</h2>
                <p className="mt-1 text-sm text-textSecondary">Optional later access for approved live-result integrations.</p>
                <form className="mt-4 space-y-3" onSubmit={handleCreateApiKey}>
                  <input
                    className="h-10 w-full rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                    placeholder="Key label"
                    value={keyForm.label}
                    onChange={(event) => setKeyForm({ ...keyForm, label: event.target.value })}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      className="h-10 rounded-md border border-borderLight px-3 text-sm text-textPrimary outline-none focus:border-accent"
                      value={keyForm.environment}
                      onChange={(event) => setKeyForm({ ...keyForm, environment: event.target.value as "SANDBOX" | "PRODUCTION" })}
                    >
                      <option value="SANDBOX">Sandbox</option>
                      <option value="PRODUCTION">Production</option>
                    </select>
                    <input
                      className="h-10 rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                      type="number"
                      min={1}
                      max={10000}
                      value={keyForm.rateLimitPerMinute}
                      onChange={(event) => setKeyForm({ ...keyForm, rateLimitPerMinute: Number(event.target.value) })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-textPrimary">
                    {scopeOptions.map((scope) => (
                      <label key={scope} className="flex items-center gap-2 rounded-md border border-borderLight bg-soft px-3 py-2">
                        <input checked={keyForm.scopes.includes(scope)} onChange={() => toggleScope(scope)} type="checkbox" />
                        <span className="break-all">{scope}</span>
                      </label>
                    ))}
                  </div>
                  <button className="h-10 w-full rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-primary disabled:bg-borderLight disabled:text-disabled" disabled={loading || !selectedInstitutionId}>
                    Generate API Key
                  </button>
                </form>
              </article>
            </aside>
          </section>

          <section className="rounded-lg border border-borderLight bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-borderLight p-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-textPrimary">Global API Key Management</h2>
                <p className="mt-1 text-sm text-textSecondary">Search, review, and revoke product or optional institution API keys.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="h-10 rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent sm:w-72"
                  placeholder="Search keys or institutions"
                  value={apiKeySearch}
                  onChange={(event) => setApiKeySearch(event.target.value)}
                />
                <div className="flex rounded-md border border-borderLight bg-soft p-1">
                  {["ALL", "ACTIVE", "REVOKED"].map((status) => (
                    <button
                      key={status}
                      className={`h-8 rounded px-3 text-xs font-semibold ${
                        apiKeyStatusFilter === status ? "bg-white text-accent shadow-sm" : "text-textSecondary"
                      }`}
                      onClick={() => setApiKeyStatusFilter(status)}
                      type="button"
                    >
                      {titleCase(status)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-soft text-xs uppercase text-textSecondary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Key</th>
                    <th className="px-4 py-3 font-semibold">Owner</th>
                    <th className="px-4 py-3 font-semibold">Environment</th>
                    <th className="px-4 py-3 font-semibold">Rate</th>
                    <th className="px-4 py-3 font-semibold">Last Used</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGlobalApiKeys.map((apiKey) => (
                    <tr key={apiKey.uuid} className="border-t border-borderLight">
                      <td className="px-4 py-3">
                        <p className="font-medium text-textPrimary">{apiKey.label}</p>
                        <p className="font-mono text-xs text-textSecondary">{apiKey.clientId}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-textPrimary">{apiKey.ownerLabel ?? "Unassigned"}</p>
                        <p className="text-xs text-textSecondary">
                          {apiKey.ownerType === "PRODUCT" ? "Product" : "Institution"} / {apiKey.ownerReference ?? "No reference"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-textPrimary">{titleCase(apiKey.environment)}</td>
                      <td className="px-4 py-3 text-textPrimary">{apiKey.rateLimitPerMinute}/min</td>
                      <td className="px-4 py-3 text-textPrimary">{apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "Never"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={apiKey.status} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="h-9 rounded-md border border-borderLight px-3 text-sm font-medium text-textPrimary disabled:bg-borderLight disabled:text-disabled"
                          disabled={apiKey.status !== "ACTIVE" || loading}
                          onClick={() => void revokeApiKey(apiKey.uuid)}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredGlobalApiKeys.length === 0 ? <EmptyState text="No API keys match the current search or filter." /> : null}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
            <article className="rounded-lg border border-borderLight bg-white shadow-sm">
              <div className="border-b border-borderLight p-4">
                <h2 className="text-lg font-semibold text-textPrimary">API Keys</h2>
                <p className="mt-1 text-sm text-textSecondary">Secrets are never shown after creation.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-soft text-xs uppercase text-textSecondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Key</th>
                      <th className="px-4 py-3 font-semibold">Environment</th>
                      <th className="px-4 py-3 font-semibold">Scopes</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedKeys.map((apiKey) => (
                      <tr key={apiKey.uuid} className="border-t border-borderLight">
                        <td className="px-4 py-3">
                          <p className="font-medium text-textPrimary">{apiKey.label}</p>
                          <p className="font-mono text-xs text-textSecondary">{apiKey.clientId}</p>
                        </td>
                        <td className="px-4 py-3 text-textPrimary">{titleCase(apiKey.environment)}</td>
                        <td className="px-4 py-3 text-textPrimary">{apiKey.scopes.join(", ")}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={apiKey.status} />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            className="h-9 rounded-md border border-borderLight px-3 text-sm font-medium text-textPrimary disabled:bg-borderLight disabled:text-disabled"
                            disabled={apiKey.status !== "ACTIVE" || loading}
                            onClick={() => void revokeApiKey(apiKey.uuid)}
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedKeys.length === 0 ? <EmptyState text="No API keys for the selected institution." /> : null}
              </div>
            </article>

            <article id="disputes" className="rounded-lg border border-dashed border-borderLight bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-textPrimary">Dispute Queue</h2>
              <p className="mt-1 text-sm text-textSecondary">No open disputes.</p>
              <EmptyState text="Learner and institution disputes will appear here." />
            </article>
          </section>

          <section id="security" className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-textPrimary">Founder Security</h2>
                <p className="mt-1 text-sm leading-6 text-textSecondary">
                  Add a time-based authenticator code to founder login before pilot use.
                </p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${mfaEnabled ? "bg-success/10 text-success" : "bg-soft text-textSecondary"}`}>
                {mfaEnabled ? "TOTP enabled" : "TOTP not enabled"}
              </span>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-md border border-borderLight bg-soft p-4">
                <p className="text-sm font-medium text-textPrimary">Authenticator setup</p>
                <p className="mt-2 text-sm leading-6 text-textSecondary">
                  Start setup, add the secret to Google Authenticator, Microsoft Authenticator, 1Password, or any TOTP app, then confirm the 6-digit code.
                </p>
                <button
                  className="mt-4 h-10 rounded-md border border-accent px-4 text-sm font-medium text-accent hover:bg-white"
                  disabled={loading}
                  onClick={() => void handleSetupTotp()}
                >
                  {mfaEnabled ? "Reset TOTP setup" : "Start TOTP setup"}
                </button>
              </div>

              {totpSetup ? (
                <form className="rounded-md border border-borderLight p-4" onSubmit={handleEnableTotp}>
                  <p className="text-sm font-medium text-textPrimary">Save this secret in your authenticator app</p>
                  <code className="mt-3 block break-all rounded-md bg-soft px-3 py-2 text-xs text-textPrimary">{totpSetup.secret}</code>
                  <p className="mt-3 text-xs font-semibold uppercase text-textSecondary">Authenticator URL</p>
                  <code className="mt-1 block break-all rounded-md bg-soft px-3 py-2 text-xs text-textPrimary">{totpSetup.otpauthUrl}</code>
                  <label className="mt-3 block">
                    <span className="text-sm font-medium text-textPrimary">6-digit code</span>
                    <input
                      className="mt-1 h-10 w-full rounded-md border border-borderLight px-3 text-sm outline-none focus:border-accent"
                      value={totpEnableCode}
                      onChange={(event) => setTotpEnableCode(event.target.value)}
                      inputMode="numeric"
                      placeholder="123456"
                    />
                  </label>
                  <button className="mt-3 h-10 w-full rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-primary disabled:bg-borderLight disabled:text-disabled" disabled={loading}>
                    Enable TOTP
                  </button>
                </form>
              ) : (
                <div className="rounded-md border border-dashed border-borderLight p-4">
                  <p className="text-sm font-medium text-textPrimary">No setup secret on screen</p>
                  <p className="mt-2 text-sm leading-6 text-textSecondary">
                    TOTP secrets are shown only during setup. Start setup when you are ready to save it in an authenticator app.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>
      </div>

      {createdKey ? <SecretModal apiKey={createdKey} onClose={() => setCreatedKey(null)} /> : null}
    </main>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 text-primary">
      <span className="relative h-8 w-8 shrink-0 rounded-full border-[4px] border-primary">
        <span className="absolute -right-1 bottom-0 h-3 w-3 rounded-full bg-accent ring-2 ring-white" />
      </span>
      <span className={`text-[18px] font-semibold tracking-normal ${compact ? "hidden" : ""}`}>
        ACAD<span className="text-accent">.ID</span>
      </span>
    </div>
  );
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M15 17H9m9-2v-4a6 6 0 0 0-12 0v4l-2 2h16l-2-2ZM10 20h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SideIcon({ label, active = false }: { label: string; active?: boolean }) {
  const iconClass = active ? "text-accent" : "text-primary";
  const common = "h-4 w-4";
  const stroke = "currentColor";

  if (label === "Overview") {
    return (
      <svg className={`${common} ${iconClass}`} fill="none" viewBox="0 0 24 24">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5Z" stroke={stroke} strokeWidth="1.8" />
      </svg>
    );
  }
  if (label === "Institutions") {
    return (
      <svg className={`${common} ${iconClass}`} fill="none" viewBox="0 0 24 24">
        <path d="M5 21V7l7-4 7 4v14M8 10h2m4 0h2M8 14h2m4 0h2M8 18h8" stroke={stroke} strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }
  if (label === "API Keys") {
    return (
      <svg className={`${common} ${iconClass}`} fill="none" viewBox="0 0 24 24">
        <path d="M15 7a4 4 0 1 1-1.4 7.75L9 19.35H6.5v-2.5l4.75-4.75A4 4 0 0 1 15 7Z" stroke={stroke} strokeWidth="1.8" />
      </svg>
    );
  }
  if (label === "Security") {
    return (
      <svg className={`${common} ${active ? "text-white" : iconClass}`} fill="none" viewBox="0 0 24 24">
        <path d="M12 3 19 6v5c0 4.5-2.9 8.1-7 10-4.1-1.9-7-5.5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg className={`${common} ${iconClass}`} fill="none" viewBox="0 0 24 24">
      <path d="M5 6h14M5 12h14M5 18h10" stroke={stroke} strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function QuickActionButton({ label, target }: { label: string; target: string }) {
  return (
    <button
      className="flex h-10 w-full items-center gap-3 rounded-md border border-borderLight bg-white px-3 text-left text-sm font-medium text-primary hover:border-accent hover:text-accent"
      onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth" })}
      type="button"
    >
      <span className="text-accent">+</span>
      {label}
    </button>
  );
}

function IconTile({ name }: { name: string }) {
  const label = name === "building" ? "Institutions" : name === "key" ? "API Keys" : name === "database" ? "Reports" : "Security";
  const bg = name === "database" ? "bg-success/10" : name === "shield" ? "bg-accent/10" : "bg-soft";
  const color = name === "database" ? "text-success" : "text-accent";
  return (
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${bg}`}>
      <SideIcon label={label} active />
      <span className={`sr-only ${color}`}>{name}</span>
    </div>
  );
}

function OverviewChart({ institutionCount }: { institutionCount: number }) {
  const total = Math.max(institutionCount, 1);
  const active = Math.max(Math.round(total * 0.7), Math.min(total, 1));
  const pending = Math.max(total - active, 0);
  const inactive = 0;

  return (
    <article className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary">Institution Overview</h2>
        <button className="h-8 rounded-md border border-borderLight px-3 text-xs font-medium text-primary" type="button">
          Last 30 days
        </button>
      </div>
      <div className="mt-4 h-44 w-full">
        <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 640 180">
          {[35, 75, 115, 155].map((y) => (
            <line key={y} stroke="#E5E7EB" strokeWidth="1" x1="0" x2="640" y1={y} y2={y} />
          ))}
          <path d="M0 165 C50 120 70 92 118 98 C170 105 178 60 230 70 C280 82 304 28 358 52 C405 74 430 25 486 42 C535 58 560 18 640 24 L640 180 L0 180 Z" fill="#2F6BFF" opacity="0.08" />
          <path d="M0 165 C50 120 70 92 118 98 C170 105 178 60 230 70 C280 82 304 28 358 52 C405 74 430 25 486 42 C535 58 560 18 640 24" fill="none" stroke="#2F6BFF" strokeWidth="4" />
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-3 border-t border-borderLight pt-4 text-sm">
        <MiniStat label="Total" value={total} tone="accent" />
        <MiniStat label="Active" value={active} tone="success" />
        <MiniStat label="Pending" value={pending} tone="warning" />
        <MiniStat label="Inactive" value={inactive} tone="error" />
      </div>
    </article>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "accent" | "success" | "warning" | "error" }) {
  const dotClass =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : tone === "error" ? "bg-error" : "bg-accent";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      <div>
        <p className="font-semibold text-primary">{value}</p>
        <p className="text-xs text-textSecondary">{label}</p>
      </div>
    </div>
  );
}

function RecentInstitutions({ institutions }: { institutions: Institution[] }) {
  return (
    <article className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary">Recent Institutions</h2>
        <a className="text-sm font-medium text-accent" href="#institutions">
          View all
        </a>
      </div>
      <div className="mt-3 divide-y divide-borderLight">
        {institutions.length ? (
          institutions.map((institution) => (
            <div key={institution.uuid} className="flex items-center gap-3 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-soft">
                <SideIcon label="Institutions" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">{institution.officialName}</p>
                <p className="text-xs text-textSecondary">{institution.institutionId}</p>
              </div>
              <StatusBadge status={institution.status} />
              <p className="hidden text-xs text-textSecondary sm:block">{formatDate(institution.createdAt)}</p>
            </div>
          ))
        ) : (
          <EmptyState text="No institutions yet. Add the first institution to activate this dashboard." />
        )}
      </div>
    </article>
  );
}

function ApiUsageDonut({ active, revoked, expired, inactive }: { active: number; revoked: number; expired: number; inactive: number }) {
  const total = Math.max(active + revoked + expired + inactive, 1);
  const activePct = Math.round((active / total) * 100);
  const circumference = 301.59;
  const activeLength = (active / total) * circumference;
  const revokedLength = (revoked / total) * circumference;
  const expiredLength = (expired / total) * circumference;

  return (
    <article className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-primary">API Key Usage</h2>
      <div className="mt-5 flex items-center gap-6">
        <svg aria-label={`${activePct}% active API keys`} className="h-32 w-32 shrink-0 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" fill="none" r="48" stroke="#E5E7EB" strokeWidth="18" />
          <circle cx="60" cy="60" fill="none" r="48" stroke="#2F6BFF" strokeDasharray={`${activeLength} ${circumference}`} strokeLinecap="round" strokeWidth="18" />
          <circle
            cx="60"
            cy="60"
            fill="none"
            r="48"
            stroke="#10B981"
            strokeDasharray={`${revokedLength} ${circumference}`}
            strokeDashoffset={-activeLength}
            strokeLinecap="round"
            strokeWidth="18"
          />
          <circle
            cx="60"
            cy="60"
            fill="none"
            r="48"
            stroke="#F59E0B"
            strokeDasharray={`${expiredLength} ${circumference}`}
            strokeDashoffset={-(activeLength + revokedLength)}
            strokeLinecap="round"
            strokeWidth="18"
          />
          <text className="rotate-90 fill-primary text-sm font-semibold" dominantBaseline="middle" textAnchor="middle" x="60" y="-60">
            {total}
          </text>
        </svg>
        <div className="space-y-3 text-sm">
          <Legend color="bg-accent" label="Active" value={active} />
          <Legend color="bg-success" label="Revoked" value={revoked} />
          <Legend color="bg-warning" label="Expired" value={expired} />
          <Legend color="bg-borderLight" label="Inactive" value={inactive} />
        </div>
      </div>
    </article>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="min-w-20 text-textSecondary">{label}</span>
      <span className="font-medium text-primary">{value}</span>
    </div>
  );
}

function ApiRequestBars() {
  const bars = [52, 68, 43, 66, 48, 34, 76];
  return (
    <article className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-primary">API Requests</h2>
      <p className="mt-6 text-[28px] font-semibold leading-none text-primary">2,542</p>
      <p className="mt-2 text-sm text-success">28.6% vs previous 7 days</p>
      <div className="mt-6 flex h-24 items-end gap-4">
        {bars.map((height, index) => (
          <div key={height + index} className="flex flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-md bg-accent" style={{ height: `${height}px` }} />
            <span className="text-xs text-textSecondary">{["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"][index]}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function SystemHealth() {
  return (
    <article className="rounded-lg border border-borderLight bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-primary">System Health</h2>
      <div className="mt-4 divide-y divide-borderLight">
        {["Database", "API Gateway", "Authentication", "Storage"].map((item) => (
          <div key={item} className="flex items-center justify-between py-3 text-sm">
            <span className="text-primary">{item}</span>
            <span className="font-medium text-success">Operational</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function NoticeMessage({ notice }: { notice: Notice }) {
  return (
    <div
      className={`mt-4 rounded-md border px-3 py-2 text-sm ${
        notice.tone === "success" ? "border-success/20 bg-success/10 text-success" : "border-error/20 bg-error/10 text-error"
      }`}
    >
      {notice.text}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="m-4 rounded-md bg-soft px-3 py-4 text-sm text-textSecondary">{text}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE" || status === "Verified";
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${active ? "bg-success/10 text-success" : "bg-soft text-textSecondary"}`}>
      {titleCase(status)}
    </span>
  );
}

function SecretModal({ apiKey, onClose }: { apiKey: CreatedApiKey; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-primary/30 px-4">
      <section className="w-full max-w-lg rounded-lg border border-borderLight bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-textPrimary">API Key Generated</h2>
        <p className="mt-2 text-sm leading-6 text-textSecondary">{apiKey.warning}</p>
        <div className="mt-4 space-y-3">
          <SecretRow label="Client ID" value={apiKey.clientId} />
          <SecretRow label="Client Secret" value={apiKey.clientSecret} secret />
        </div>
        <button className="mt-5 h-10 w-full rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-primary disabled:bg-borderLight disabled:text-disabled" onClick={onClose}>
          I have saved it
        </button>
      </section>
    </div>
  );
}

function SecretRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase text-textSecondary">{label}</p>
      <div className="mt-1 flex gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-soft px-3 py-2 text-xs text-textPrimary">
          {secret ? value : value}
        </code>
        <button className="h-10 rounded-md border border-borderLight px-3 text-sm font-medium text-textPrimary hover:border-primary" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function slug(value: string) {
  return value.toLowerCase().replaceAll(" ", "-");
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
