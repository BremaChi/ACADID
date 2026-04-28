"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_ACADID_API_URL ?? "http://localhost:4000/api";
const navItems = ["Overview", "Institutions", "API Keys", "Disputes", "Reports", "Security"];
const scopeOptions = ["ingest:write", "govern:write", "access:read", "verify:read", "identity:write", "webhook:manage"];

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
  institutionId: string;
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
  };
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
  const [email, setEmail] = useState("founder@acadid.local");
  const [password, setPassword] = useState("");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, ApiKey[]>>({});
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
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

  const selectedInstitution = institutions.find((institution) => institution.uuid === selectedInstitutionId);
  const selectedKeys = selectedInstitutionId ? apiKeys[selectedInstitutionId] ?? [] : [];
  const activeKeys = Object.values(apiKeys)
    .flat()
    .filter((key) => key.status === "ACTIVE");

  const metrics = useMemo(
    () => [
      { label: "Institutions", value: institutions.length.toString(), helper: "Live from API" },
      { label: "API Keys", value: activeKeys.length.toString(), helper: "Active keys" },
      { label: "Database", value: "Live", helper: "Supabase PostgreSQL" },
      { label: "Gateway", value: "Scoped", helper: "/auth/token enabled" }
    ],
    [activeKeys.length, institutions.length]
  );

  useEffect(() => {
    const savedToken = window.localStorage.getItem("acadid_founder_token");
    const savedName = window.localStorage.getItem("acadid_founder_name");
    if (savedToken) {
      setToken(savedToken);
      setFounderName(savedName ?? "Founder");
      void refreshData(savedToken);
    }
  }, []);

  async function refreshData(activeToken = token) {
    if (!activeToken) {
      return;
    }
    setLoading(true);
    try {
      const nextInstitutions = await apiRequest<Institution[]>("/admin/institutions", activeToken);
      const nextKeyEntries = await Promise.all(
        nextInstitutions.map(async (institution) => {
          const keys = await apiRequest<ApiKey[]>(`/admin/institutions/${institution.uuid}/api-keys`, activeToken);
          return [institution.uuid, keys] as const;
        })
      );
      setInstitutions(nextInstitutions);
      setApiKeys(Object.fromEntries(nextKeyEntries));
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
        body: JSON.stringify({ email, password })
      });
      setToken(login.accessToken);
      setFounderName(login.user.fullName);
      window.localStorage.setItem("acadid_founder_token", login.accessToken);
      window.localStorage.setItem("acadid_founder_name", login.user.fullName);
      setPassword("");
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
    setToken(null);
    setInstitutions([]);
    setApiKeys({});
    setSelectedInstitutionId("");
    setNotice(null);
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

  if (!token) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-ink">
        <section className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-lagoon">AcadID</p>
          <h1 className="mt-2 text-2xl font-semibold">Founder Console</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Sign in to manage institutions, Authority Grants, and API keys.</p>
          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Password</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
              />
            </label>
            <button className="h-11 w-full rounded-md bg-lagoon px-4 text-sm font-semibold text-white hover:bg-teal-800" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          {notice ? <NoticeMessage notice={notice} /> : <EmptyState text="No active founder session." />}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:gap-6 lg:py-6">
        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-48px)] lg:w-64">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div>
              <p className="text-sm font-semibold text-lagoon">AcadID</p>
              <p className="text-xs text-slate-500">Founder Console</p>
            </div>
            <details className="lg:hidden">
              <summary className="cursor-pointer rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                Menu
              </summary>
              <nav className="absolute left-4 right-4 z-10 mt-3 rounded-lg border border-slate-200 bg-white p-2 shadow-md">
                {navItems.map((item) => (
                  <a key={item} className="block rounded-md px-3 py-2 text-sm text-slate-700" href={`#${slug(item)}`}>
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
                className={`mb-1 block rounded-md px-3 py-2 text-sm font-medium ${
                  item === "Overview" ? "bg-mist text-lagoon" : "text-slate-600 hover:bg-slate-50"
                }`}
                href={`#${slug(item)}`}
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="hidden border-t border-slate-200 p-4 lg:block">
            <p className="text-xs font-semibold uppercase text-slate-500">Signed in</p>
            <p className="mt-2 text-sm font-medium text-slate-700">{founderName}</p>
            <button className="mt-3 h-9 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-600" onClick={logout}>
              Log out
            </button>
          </div>
        </aside>

        <section className="flex-1 space-y-4">
          <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-ink">Founder Console</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Live Phase 0 control plane for institution onboarding and API access.
                </p>
              </div>
              <button
                className="h-10 rounded-md bg-lagoon px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
                onClick={() => document.getElementById("api-keys")?.scrollIntoView({ behavior: "smooth" })}
              >
                Generate API Key
              </button>
            </div>
            {notice ? <NoticeMessage notice={notice} /> : null}
          </header>

          <section id="overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <article key={metric.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{metric.value}</p>
                <p className="mt-1 text-xs text-slate-500">{metric.helper}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
            <article id="institutions" className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-ink">Institution Management</h2>
                  <p className="mt-1 text-sm text-slate-600">Create institutions and select one for authority/key actions.</p>
                </div>
                <button className="h-10 rounded-md border border-lagoon px-4 text-sm font-semibold text-lagoon hover:bg-mist" onClick={() => void refreshData()}>
                  Refresh
                </button>
              </div>

              <form className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1fr_150px_120px_120px_auto]" onSubmit={handleCreateInstitution}>
                <input
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon"
                  placeholder="Institution official name"
                  value={institutionForm.officialName}
                  onChange={(event) => setInstitutionForm({ ...institutionForm, officialName: event.target.value })}
                />
                <select
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-lagoon"
                  value={institutionForm.type}
                  onChange={(event) => setInstitutionForm({ ...institutionForm, type: event.target.value })}
                >
                  <option value="PRIMARY">Primary</option>
                  <option value="SECONDARY">Secondary</option>
                  <option value="TERTIARY">Tertiary</option>
                  <option value="EXAM_BODY">Exam body</option>
                </select>
                <input
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon"
                  placeholder="State"
                  value={institutionForm.state}
                  onChange={(event) => setInstitutionForm({ ...institutionForm, state: event.target.value })}
                />
                <select
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-lagoon"
                  value={institutionForm.tier}
                  onChange={(event) => setInstitutionForm({ ...institutionForm, tier: event.target.value })}
                >
                  <option value="FOUNDING">Founding</option>
                  <option value="ACTIVE">Active</option>
                  <option value="VERIFIED">Verified</option>
                </select>
                <button className="h-10 rounded-md bg-lagoon px-4 text-sm font-semibold text-white hover:bg-teal-800" disabled={loading}>
                  Create
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
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
                        className={`cursor-pointer border-t border-slate-100 ${institution.uuid === selectedInstitutionId ? "bg-mist" : "hover:bg-slate-50"}`}
                        onClick={() => setSelectedInstitutionId(institution.uuid)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{institution.officialName}</p>
                          <p className="text-xs text-slate-500">{institution.institutionId}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{institution.state}</td>
                        <td className="px-4 py-3 text-slate-700">{titleCase(institution.tier)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={institution.status} />
                        </td>
                        <td className="px-4 py-3 text-slate-700">{apiKeys[institution.uuid]?.length ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {institutions.length === 0 ? <EmptyState text="No institutions yet. Create the first institution above." /> : null}
              </div>
            </article>

            <aside id="api-keys" className="space-y-4">
              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">Selected Institution</h2>
                {selectedInstitution ? (
                  <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                    <p className="font-medium text-ink">{selectedInstitution.officialName}</p>
                    <p className="mt-1">{selectedInstitution.institutionId}</p>
                  </div>
                ) : (
                  <EmptyState text="Select or create an institution." />
                )}
              </article>

              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">Authority Grant</h2>
                <form className="mt-4 space-y-3" onSubmit={handleCreateAuthorityGrant}>
                  <input
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon"
                    placeholder="Signed by name"
                    value={authorityForm.signedByName}
                    onChange={(event) => setAuthorityForm({ ...authorityForm, signedByName: event.target.value })}
                  />
                  <input
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon"
                    placeholder="Signed by title"
                    value={authorityForm.signedByTitle}
                    onChange={(event) => setAuthorityForm({ ...authorityForm, signedByTitle: event.target.value })}
                  />
                  <input
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon"
                    type="date"
                    value={authorityForm.effectiveFrom}
                    onChange={(event) => setAuthorityForm({ ...authorityForm, effectiveFrom: event.target.value })}
                  />
                  <button className="h-10 w-full rounded-md border border-lagoon px-4 text-sm font-semibold text-lagoon hover:bg-mist" disabled={loading || !selectedInstitutionId}>
                    Activate Authority
                  </button>
                </form>
              </article>

              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">API Key Generation</h2>
                <form className="mt-4 space-y-3" onSubmit={handleCreateApiKey}>
                  <input
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon"
                    placeholder="Key label"
                    value={keyForm.label}
                    onChange={(event) => setKeyForm({ ...keyForm, label: event.target.value })}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-lagoon"
                      value={keyForm.environment}
                      onChange={(event) => setKeyForm({ ...keyForm, environment: event.target.value as "SANDBOX" | "PRODUCTION" })}
                    >
                      <option value="SANDBOX">Sandbox</option>
                      <option value="PRODUCTION">Production</option>
                    </select>
                    <input
                      className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon"
                      type="number"
                      min={1}
                      max={10000}
                      value={keyForm.rateLimitPerMinute}
                      onChange={(event) => setKeyForm({ ...keyForm, rateLimitPerMinute: Number(event.target.value) })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-700">
                    {scopeOptions.map((scope) => (
                      <label key={scope} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <input checked={keyForm.scopes.includes(scope)} onChange={() => toggleScope(scope)} type="checkbox" />
                        <span className="break-all">{scope}</span>
                      </label>
                    ))}
                  </div>
                  <button className="h-10 w-full rounded-md bg-lagoon px-4 text-sm font-semibold text-white hover:bg-teal-800" disabled={loading || !selectedInstitutionId}>
                    Generate API Key
                  </button>
                </form>
              </article>
            </aside>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
            <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-ink">API Keys</h2>
                <p className="mt-1 text-sm text-slate-600">Secrets are never shown after creation.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
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
                      <tr key={apiKey.uuid} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{apiKey.label}</p>
                          <p className="font-mono text-xs text-slate-500">{apiKey.clientId}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{titleCase(apiKey.environment)}</td>
                        <td className="px-4 py-3 text-slate-700">{apiKey.scopes.join(", ")}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={apiKey.status} />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            className="h-9 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
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

            <article id="disputes" className="rounded-lg border border-dashed border-slate-300 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-ink">Dispute Queue</h2>
              <p className="mt-1 text-sm text-slate-600">No open disputes.</p>
              <EmptyState text="Learner and institution disputes will appear here." />
            </article>
          </section>
        </section>
      </div>

      {createdKey ? <SecretModal apiKey={createdKey} onClose={() => setCreatedKey(null)} /> : null}
    </main>
  );
}

function NoticeMessage({ notice }: { notice: Notice }) {
  return (
    <div
      className={`mt-4 rounded-md border px-3 py-2 text-sm ${
        notice.tone === "success" ? "border-lagoon/20 bg-mist text-lagoon" : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {notice.text}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="m-4 rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">{text}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE" || status === "Verified";
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${active ? "bg-mist text-lagoon" : "bg-slate-100 text-slate-600"}`}>
      {titleCase(status)}
    </span>
  );
}

function SecretModal({ apiKey, onClose }: { apiKey: CreatedApiKey; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 px-4">
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-lg">
        <h2 className="text-xl font-semibold text-ink">API Key Generated</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{apiKey.warning}</p>
        <div className="mt-4 space-y-3">
          <SecretRow label="Client ID" value={apiKey.clientId} />
          <SecretRow label="Client Secret" value={apiKey.clientSecret} secret />
        </div>
        <button className="mt-5 h-10 w-full rounded-md bg-lagoon px-4 text-sm font-semibold text-white hover:bg-teal-800" onClick={onClose}>
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
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <div className="mt-1 flex gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {secret ? value : value}
        </code>
        <button className="h-10 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700" onClick={() => void copy()}>
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
