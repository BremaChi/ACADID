const navItems = ["Overview", "Institutions", "API Keys", "Webhooks", "Disputes", "Reports", "Security"];

const metrics = [
  { label: "Institutions", value: "3", helper: "2 sandbox keys active" },
  { label: "Learners", value: "3", helper: "Supabase-backed" },
  { label: "Credentials", value: "3", helper: "All cryptographic checks valid" },
  { label: "Verifications", value: "3", helper: "Reference checks confirmed" }
];

const institutions = [
  {
    id: "AINi-00001",
    name: "AcadID Supabase Pilot",
    state: "Lagos",
    tier: "Active",
    status: "Verified",
    keys: 1
  },
  {
    id: "AINi-00002",
    name: "AcadID Supabase Pilot",
    state: "Lagos",
    tier: "Active",
    status: "Verified",
    keys: 1
  },
  {
    id: "AINi-00003",
    name: "AcadID Supabase Pilot",
    state: "Lagos",
    tier: "Active",
    status: "Verified",
    keys: 1
  }
];

const gatewayChecks = [
  { label: "POST /auth/token", status: "Live" },
  { label: "POST /ingest/students", status: "Scoped" },
  { label: "POST /govern/publish", status: "Scoped" },
  { label: "GET /verify/ref/:ref", status: "Public" }
];

export default function HomePage() {
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
                  <a
                    key={item}
                    className="block rounded-md px-3 py-2 text-sm text-slate-700"
                    href={`#${item.toLowerCase().replaceAll(" ", "-")}`}
                  >
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
                href={`#${item.toLowerCase().replaceAll(" ", "-")}`}
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="hidden border-t border-slate-200 p-4 lg:block">
            <p className="text-xs font-semibold uppercase text-slate-500">Active database</p>
            <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">Supabase PostgreSQL</p>
          </div>
        </aside>

        <section className="flex-1 space-y-4">
          <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-ink">Founder Console</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Phase 0 control plane for institutions, API keys, gateway access, and platform health.
                </p>
              </div>
              <button className="h-10 rounded-md bg-lagoon px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-800">
                Generate API Key
              </button>
            </div>
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

          <section className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
            <article id="institutions" className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-ink">Institution Management</h2>
                  <p className="mt-1 text-sm text-slate-600">Onboarding, authority status, and API access.</p>
                </div>
                <button className="h-10 rounded-md border border-lagoon px-4 text-sm font-semibold text-lagoon hover:bg-mist">
                  New Institution
                </button>
              </div>
              <div className="border-b border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    className="h-10 flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon"
                    placeholder="Search institution or ID"
                  />
                  <select className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-lagoon">
                    <option>All statuses</option>
                    <option>Verified</option>
                    <option>Suspended</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
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
                      <tr key={institution.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{institution.name}</p>
                          <p className="text-xs text-slate-500">{institution.id}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{institution.state}</td>
                        <td className="px-4 py-3 text-slate-700">{institution.tier}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-mist px-2 py-1 text-xs font-semibold text-lagoon">
                            {institution.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{institution.keys}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <aside id="api-keys" className="space-y-4">
              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">API Key Generation</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">One-time client secret display with scoped access.</p>
                  </div>
                  <span className="rounded-full bg-mist px-2 py-1 text-xs font-semibold text-lagoon">Phase 0</span>
                </div>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500">Environment</span>
                    <select className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-lagoon">
                      <option>Sandbox</option>
                      <option>Production</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500">Scopes</span>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700">
                      {["ingest:write", "govern:write", "verify:read", "webhook:manage"].map((scope) => (
                        <span key={scope} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          {scope}
                        </span>
                      ))}
                    </div>
                  </label>
                </div>
              </article>

              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">Gateway Status</h2>
                <p className="mt-1 text-sm text-slate-600">Active API boundary checks.</p>
                <div className="mt-4 space-y-2">
                  {gatewayChecks.map((check) => (
                    <div key={check.label} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                      <span className="font-mono text-xs text-slate-700">{check.label}</span>
                      <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">{check.status}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article id="disputes" className="rounded-lg border border-dashed border-slate-300 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">Dispute Queue</h2>
                <p className="mt-1 text-sm text-slate-600">No open disputes.</p>
                <div className="mt-4 rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  New learner or institution disputes will appear here for founder review.
                </div>
              </article>
            </aside>
          </section>
        </section>
      </div>
    </main>
  );
}
