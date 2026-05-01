# AcadID Project Status

## Current Build State

AcadID has moved from concept documents into a working TypeScript monorepo foundation.

Latest architecture source:

- `C:\Users\HP\Downloads\AcadID_Architecture_Brief_v3.docx`
- `C:\Users\HP\Downloads\ACADID_Full_Updated_Architecture_v2_1.docx`
- Persistent project memory: `docs/architecture-brief-v3-memory.md`

Created:

- Architecture review packet in `architecture-review/`.
- MVP build blueprint in `MVP_BUILD_BLUEPRINT.md`.
- TypeScript monorepo root configuration.
- NestJS API app in `apps/api`.
- Next.js web app in `apps/web`.
- Prisma database package in `packages/database`.
- Shared domain package in `packages/shared`.
- Audit interface package in `packages/audit`.
- Credential signing adapter package in `packages/crypto`.
- Web dev helper script in `scripts/dev-web.cmd`.
- API dev helper script in `scripts/start-api.cmd`.
- Optional WSL Docker PostgreSQL fallback helper script in `scripts/start-db-wsl.cmd`.
- GitHub Actions CI workflow in `.github/workflows/ci.yml`.
- Runtime setup guidance in `docs/runtime-options.md`.
- Architecture v3 memory note in `docs/architecture-brief-v3-memory.md`.
- Architecture v3.1 MVP update memory covering product-level API keys, Institution Portal onboarding, founder approval, and optional institution API access.
- Founder authenticator-code security for the Founder Console.

## Implemented Foundation

### API

The API has these first modules:

- Auth module for staff login, bearer token creation, `/auth/me`, password verification, and founder TOTP setup/enforcement.
- Admin module for institution creation, institution status updates, and Authority Grant creation.
- Founder API key workflow for one-time `client_secret` generation, safe key listing, revocation, and `POST /auth/token`.
- Global founder API key listing for all institutions with institution context and no secret material.
- Ingestion Door for student register intake, learner matching/creation, AIN assignment, enrolment creation, and draft result batch creation.
- Governance Door for batch submission, review, approval, publication, rejection, amendment, and revocation.
- Access Door for learner passport, credential list, hashed share-link creation, grant revocation, and learner verification log.
- Verification Door for share-token, credential-reference, and credential-status checks.
- Platform services for Prisma, audit writing, Authority Grant enforcement, and credential signing.
- Admin routes are restricted to `ACADID_SUPER_ADMIN`.
- Ingestion routes are restricted to AcadID admins and institution operating roles.
- Governance routes are restricted to AcadID admins, Registrars, and Exam Officers.
- Institution staff routes now enforce institution membership, so staff cannot operate on another institution by changing an ID.
- API clients now receive scoped bearer tokens and are limited to their assigned institution.
- API key rate limiting is enforced from token metadata.
- Credential publication now uses Ed25519 JOSE/JWS signatures and embeds a proof in the VC payload.
- Credential signing is prepared outside the publish transaction so database writes remain fast under load.
- Founder TOTP secrets are encrypted at rest, setup is guarded by an authenticated session, and login requires an authenticator code after TOTP is enabled.
- API keys now support v3.1 ownership: product-level MVP keys and optional institution-level keys.
- Institution Portal application intake is implemented through the Data Center API with scoped product-key access.
- Founder approval/rejection workflow for institution applications is implemented in the API and surfaced in the Founder Console.
- Developer Access Requests are now a database-backed governance workflow with founder create, list, approve, reject, and suspend endpoints.
- Institution Live Results API key generation is locked behind approved Developer Access.
- Disputes are now database-backed with founder list, create, assign, institution-notice, escalate, and close endpoints.
- Founder-level Verification Logs are exposed through the Data Center API across all institutions and credentials without returning encrypted verifier email or IP hashes.
- Founder-level System Health and gateway metrics are exposed through the Data Center API with component status, response timing, gateway counts, error rate, and derived incidents.
- Founder-level Revenue overview is backed by a ledger model for verification fees, credential export fees, and institution subscriptions.
- Founder-level Platform Settings are persisted through the Data Center API for approval rules, API defaults, notifications, and email template subjects.
- Credential signing now reports JOSE/JWS Ed25519 readiness, validates configured keypairs, and fails fast when configured signing keys are required but missing.
- Founder MFA recovery codes are supported as hashed, one-time backup codes with TOTP-protected rotation and one-time login consumption.
- Verification events now capture verifier context with hashed IP addresses and encrypted verifier email values.

### Database

The Prisma schema includes the core AcadID model:

- Learner.
- Institution.
- User.
- InstitutionUser.
- AuthorityGrant.
- Enrolment.
- ResultBatch.
- AcademicRecord.
- Credential.
- AccessGrant.
- VerificationEvent.
- ImportFile.
- MouDocument.
- AuditEvent.
- ApiKey.
- DeveloperAccessRequest.
- Dispute.
- RevenueLedgerEntry.
- InstitutionSubscription.
- PlatformSetting.
- MfaRecoveryCode.

### Web

The web app currently provides an operations dashboard for the first foundation workflow:

- Live Founder Console login.
- Live Founder Console authenticator-code field and security setup panel.
- Live institution list and creation form.
- Live Authority Grant creation form.
- Live API key generation with one-time secret modal.
- Live selected-institution API key list and revocation action.
- Live global API key management with search, status filters, institution context, last-used display, and revocation action.
- Live product-level API key generation for internal AcadID products.
- Live institution application approval queue for Founder review.
- Live Developer Access Request queue backed by the Data Center API, including approve, reject, and suspend actions.
- Institution Live Results API key form now lists only institutions with approved Developer Access.
- Live Disputes page backed by the Data Center API, with status filters, detail panel, founder assignment, institution notice text, escalation, and resolution notes.
- Live Verification Logs page backed by the Data Center API, with cross-institution search, outcome filters, metrics, and CSV export.
- Live System Health page backed by the Data Center API, with service status, gateway metrics, and recent incidents.
- Live Revenue page backed by the Data Center API, with ledger totals, subscription status, recent entries, and CSV export.
- Live Settings page backed by the Data Center API, with editable approval rules, API defaults, notifications, and email template subjects.
- Live Security page includes founder recovery-code status and TOTP-protected rotation with one-time display.
- Real ACAD.ID symbol asset in the Founder Console brand mark.
- ACAD.ID founder dashboard styling system with strict navy/blue brand colors, calm SaaS layout, small useful cards, clean tables, and a collapsible sidebar.
- Founder Console upgraded into a routed control-console layout with fixed independently scrollable navy sidebar, top header, one active page at a time, responsive mobile drawer, functional Overview, Institutions, Applications, API Keys, Developer Access Requests, Disputes, Verification Logs, Revenue, System Health, Security, and Settings pages.

## Validation Completed

Completed successfully:

- `npm install`
- `npm run db:generate`
- `npm run typecheck`
- `npm run build`
- `npm test`
- Local dashboard health check on `http://localhost:3000/`
- Supabase PostgreSQL configured through root `.env` using `DATABASE_URL` and `DIRECT_URL`.
- Initial Prisma migration deployed to Supabase with `npm run db:deploy`.
- Seeded AcadID Super Admin: `founder@acadid.local`.
- API health check passes at `http://localhost:4000/api/health`.
- Founder admin login succeeds against the live database.
- `npm run smoke:api`
- Founder Console returns 200 at `http://localhost:3000`.
- Founder Console ACAD.ID UI refresh typechecks, builds, and renders without the stale Next.js cache error after clearing `apps/web/.next`.
- Founder Console navigation refactor validates with `npm run typecheck`, `npm test`, and `http://localhost:3000` returning 200.
- Developer Access Request workflow validates with `npm run typecheck`, `npm test`, `npm run db:deploy`, `npm run smoke:api`, and browser verification in the Founder Console.
- Dispute workflow validates with `npm run typecheck`, `npm test`, `npm run db:deploy`, authenticated `/api/admin/disputes` check, and browser verification in the Founder Console.
- Founder Verification Logs workflow validates with `npm run typecheck`, `npm test`, and authenticated `/api/admin/verification-logs` check.
- Founder System Health workflow validates with `npm run typecheck`, `npm test`, and authenticated `/api/admin/system-health` check.
- Founder Revenue workflow validates with `npm run typecheck`, `npm test`, `npm run db:deploy`, and authenticated `/api/admin/revenue` check.
- Founder Settings workflow validates with `npm run typecheck`, `npm test`, `npm run db:deploy`, authenticated `/api/admin/settings` read/save checks, and browser verification in the Founder Console.
- Credential signing readiness validates with `npm run typecheck`, `npm test`, and authenticated `/api/admin/system-health`; local development reports `Credential Signing` as degraded until stable deployment keys are configured.
- Founder MFA recovery workflow validates with `npm run typecheck`, `npm test`, `npm run db:deploy`, and authenticated `/api/auth/mfa/recovery-codes` status check.
- Founder TOTP migration deployed to Supabase.
- Supabase runtime pool settings use a transaction-safe PostgreSQL route with `connection_limit=2` and `pool_timeout=30` for local development because Prisma interactive transactions need a stable session.
- End-to-end pilot flow verified:
  - Created pilot institution `AINi-00001`.
  - Created active Authority Grant.
  - Generated a sandbox API key with `ingest:write`, `govern:write`, and `verify:read` scopes.
  - Exchanged `client_id` and one-time `client_secret` through `POST /auth/token`.
  - Ingested learner and assigned `AIN-NG-2026-0000001`.
  - Created, approved, and published a result batch.
  - Verified issued credential with cryptographic status `VALID`.

Known validation note:

- `npm install` reports dependency vulnerabilities. These need review before production. Do not run force fixes blindly.
- Docker PostgreSQL is no longer required for normal development. It remains available only as an optional local fallback.
- Architecture v3.1 changes the MVP API key model: internal AcadID products get API keys first; institutions register through the Institution Portal and only later request optional API access.
- Prisma migrate may still print a Supabase schema-engine warning, but the repository fallback migration runner applies pending migrations successfully.
- On April 30, 2026, local Supabase runtime checks briefly returned Prisma `P1001` connection errors to the pooler even though the TCP port was reachable. Connectivity later recovered, and authenticated Verification Logs, System Health, Revenue, and Settings checks returned 200.
- On May 1, 2026, local System Health correctly reports `Credential Signing` as `DEGRADED` because development is using an ephemeral signing key. This is expected until real deployment secrets are provisioned.

## Local Runtime

Web app:

- Running at `http://localhost:3000`.

API app:

- Running at `http://localhost:4000` after Supabase settings are present in root `.env`, migrations are applied, and seed data exists.

## Next Engineering Steps

1. Provision stable production signing keys in the deployment secret store using `npm run crypto:keygen`, then enable `ACADID_REQUIRE_CONFIGURED_SIGNING_KEYS=true` outside local dev.
2. Add billing event writers when verification/export/subscription workflows begin charging real fees.
3. Start Engineer 2 handoff package for institution portal integration against the Data Center API.
4. Add login history and session management to the Security page.

## GitHub Status

Remote repository:

- `https://github.com/BremaChi/ACADID.git`

Already pushed:

- Monorepo foundation scaffold.
- Database migration and seed workflow.
- Web startup helper.
- Supabase PostgreSQL migration workflow.
- Prisma root `.env` helper.
- Supabase API smoke test.
- Runtime docs/status updates for active Supabase development.

## Immediate Recommendation

Add database-backed automated tests now that Supabase PostgreSQL is the active development database.

Best production-safe database path:

- Use Supabase PostgreSQL as the active cloud database during development/pilot.
- Keep Docker PostgreSQL only as optional local fallback.
- Keep PostgreSQL as the system of record for speed, integrity, and future scale.
