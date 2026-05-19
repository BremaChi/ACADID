# AcadID Start Here

Status: Active  
Owner: Core Platform Team  
Last updated: 2026-05-19

## Architecture Overview

AcadID is a permanent academic identity infrastructure for Nigerian institutions. The platform is organized as:

1. Core Data Center: PostgreSQL/Supabase data model, Prisma schema, audit logs, credential signing, queues, workers, and platform services.
2. Controlled Gateway: `/auth`, `/portal`, `/ingest`, `/govern`, `/access`, `/verify`, `/admin`, `/jobs`, and `/webhooks` APIs.
3. Product Layer: Founder Console, Institution Portal, Student Mobile App, Employer Verification Portal, Exam Body Connector, and future products.
4. External Partner Ecosystem: schools, exam bodies, employers, payment providers, webhook receivers, and notification providers.

## Required Reading Order

All teams:

1. `docs/WORKSTREAM_STATUS.md`
2. `docs/contracts/API_CONTRACTS.md`
3. `docs/contracts/AUTH_CONTRACTS.md`
4. `docs/contracts/DATABASE_CONTRACTS.md`
5. `docs/contracts/WEBHOOK_CONTRACTS.md`
6. `docs/contracts/UI_NAVIGATION_CONTRACTS.md`
7. `PROJECT_STATUS.md`
8. `SECURITY_NOTES.md`
9. `SECURITY_UPGRADE_PLAN.md`

Team-specific:

- Core Platform Team: `docs/handoff/CORE_PLATFORM_HANDOFF.md`
- Institution Portal Team: `docs/handoff/INSTITUTION_PORTAL_HANDOFF.md`
- Student Product Team: `docs/handoff/STUDENT_PRODUCT_HANDOFF.md`
- Employer Verification Team: `docs/handoff/EMPLOYER_VERIFICATION_HANDOFF.md`
- QA/Security/Release Team: `docs/handoff/QA_SECURITY_RELEASE_HANDOFF.md`

## Where Each Team Begins

- Core Platform Team begins with platform reliability, contracts, migrations, auth, queues, workers, and Founder Console control workflows.
- Institution Portal Team begins with onboarding and approved-institution planning, but remains in `STANDBY` until activated.
- Student Product Team begins with learner passport and record-request planning, but remains in `STANDBY` until activated.
- Employer Verification Team begins with verification UX and verifier-flow planning, but remains in `STANDBY` until activated.
- QA/Security/Release Team begins with test matrix and release/security planning, but remains in `STANDBY` until activated.

## Shared Rules

- One repository.
- Separate product workstreams.
- Shared architecture.
- Shared contracts.
- No duplicated business logic.
- No secret values committed.
- Additive database migrations preferred.
- All changes must pass tests before handoff.
- Infrastructure changes must remain backward compatible whenever possible.
- Product teams must not connect directly to Supabase or Prisma for product behavior.

## Mandatory Coordination Rule

Any future API, database, auth, webhook, shared state, queue, worker, or shared UI contract change must update the relevant contract document before other teams depend on it.

## Migration Rules

- Core Platform Team owns Prisma schema and migrations.
- Never edit applied migrations.
- Use additive migrations wherever possible.
- Update `docs/contracts/DATABASE_CONTRACTS.md` when shared database behavior changes.
- Run `npm run db:generate` and `npm run db:deploy` when required.

## Testing Rules

Baseline checks before handoff:

- `npm run typecheck`
- `npm test`
- `npm run smoke:api` when API behavior changes
- `npm run worker:once` when worker/queue behavior changes

UI changes must be checked in a browser at desktop and mobile/tablet widths where possible.

## Branch Strategy

- `main` is the integrated source of truth.
- Use focused branches for larger changes, for example `core/platform-reliability`, `portal/onboarding-plan`, or `security/release-hardening`.
- Keep branch changes scoped to the active workstream.
- Do not merge shared contract changes without updating the corresponding contract document.

## Protected Shared Infrastructure

Core Platform review is required for:

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/**`
- `packages/shared/src/**`
- `packages/crypto/src/**`
- `apps/api/src/modules/auth/**`
- `apps/api/src/modules/platform/**`
- `apps/api/src/modules/gateway/**`
- `apps/api/src/modules/jobs/**`
- `docs/contracts/**`
- Founder Console shared shell and navigation in `apps/web/app/founder-console.tsx`

## Local Runtime

Use:

- `scripts/start-acadid-local.cmd` to start local web/API.
- `scripts/stop-acadid-local.cmd` to stop local web/API.

Localhost works only while those processes are running on the laptop.

