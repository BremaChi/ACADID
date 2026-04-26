const buildPillars = [
  "Core Data Center",
  "Controlled Gateway",
  "Authority Grants",
  "Institution Upload Portal",
  "Three-tier Governance",
  "Credential Records"
];

const workflow = [
  "Admin creates institution",
  "Authority Grant is activated",
  "Data Entry uploads register/results",
  "Exam Officer reviews",
  "Registrar approves and publishes",
  "Credential and audit events are generated"
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-lagoon">AcadID</p>
            <h1 className="text-xl font-semibold text-ink">Operations Foundation</h1>
          </div>
          <div className="rounded-md border border-lagoon/25 bg-mist px-3 py-2 text-sm font-medium text-lagoon">
            Phase 0 + Phase 1
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-gold">Build Target</p>
          <h2 className="mt-3 text-3xl font-semibold text-ink">First trusted academic record pipeline</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-700">
            This portal starts as the operational surface for institution onboarding, Authority Grants,
            student register uploads, result governance, credential generation, and full audit visibility.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {buildPillars.map((pillar) => (
              <div key={pillar} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                {pillar}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-lagoon">Gateway Doors</p>
          <div className="mt-4 space-y-3">
            {["/ingest", "/govern", "/access", "/verify"].map((door) => (
              <div key={door} className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3">
                <span className="font-mono text-sm text-ink">{door}</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">active boundary</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-10">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-lagoon">First Workflow</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">Institution to published credential</h2>
            </div>
            <p className="text-sm text-slate-600">Every step must write an audit event.</p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {workflow.map((step, index) => (
              <div key={step} className="rounded-md border border-slate-200 p-4">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-lagoon text-sm font-bold text-white">
                  {index + 1}
                </div>
                <p className="text-sm font-medium leading-6 text-slate-800">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
