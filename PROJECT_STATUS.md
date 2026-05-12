# AcadID Project Status

## Current Build State

AcadID has moved from concept documents into a working TypeScript monorepo foundation.

Latest architecture source:

- `C:\Users\HP\Downloads\AcadID_Architecture_Brief_v3.docx`
- `C:\Users\HP\Downloads\ACADID_Full_Updated_Architecture_v2_1.docx`
- `C:\Users\HP\Downloads\AcadID_Architecture_Brief_v4_Updated.docx`
- `C:\Users\HP\Downloads\AcadID_Architecture_Brief_v5 (1).docx`
- Persistent project memory: `docs/architecture-brief-v3-memory.md`
- Active v4 project memory: `docs/architecture-brief-v4-memory.md`
- Active v5 project memory: `docs/architecture-brief-v5-memory.md`

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
- Architecture v4 memory note in `docs/architecture-brief-v4-memory.md`, making Institution Workspace isolation, human institution sessions, expanded audit logging, and Graduate Record Requests the active next planning source.
- Architecture v5 memory note in `docs/architecture-brief-v5-memory.md`, making AcademicSession, AcademicStructure, scoped staff assignment, modular result engines, manual rollover, and premium trust identity the active next planning source.
- Founder authenticator-code security for the Founder Console.
- Platform foundation roadmap in `docs/platform-foundation-roadmap.md`, making queue/event bus, webhook delivery, retries, idempotency, audit logging, workers, monitoring, rate limiting, caching, and observability the next infrastructure priority order.
- Security upgrade sprint plan in `SECURITY_UPGRADE_PLAN.md`, keeping Nest/Next major upgrades isolated on `security/framework-upgrade`.

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
- Founder dashboard summary and audit-event endpoints now provide live aggregate metrics, seven-day gateway usage, institution status distribution, and recent control-plane activity.
- Founder API key regeneration is implemented with one-time secret display, audit logging, and status reset for rotated keys.
- Founder emergency lockdown is implemented as a guarded API-key revocation workflow that records an audit event.
- Institution application request-more-information and email-record actions are implemented with founder audit events.
- Architecture v4 InstitutionUser foundation is implemented with staff invitation status, permissions, invite tokens, invite acceptance, human `/auth/user/*` endpoints, and institution-scoped login claims.
- Founder institution staff control is implemented through `/api/admin/institutions/:id/staff`, `/api/admin/institutions/:id/staff/invite`, and `/api/admin/institution-staff/:id`, covering safe staff listing, founder-created invites, status changes, permission updates, TOTP requirement flags, assigned academic scopes, and audit logging.
- Founder institution approval now creates the institution workspace and a one-time Registrar invite token for the approved institution contact.
- Workspace isolation utilities are implemented in `AuthorityService`, including active human membership checks, institution-scoped query helpers, and tested cross-institution blocking.
- Human institution sessions now enforce permission scopes through `ScopesGuard`, so suspended or under-permissioned staff cannot use protected gateway actions.
- Architecture v4 RecordRequest foundation is implemented with schema, Supabase migration, learner submission/listing through `/access/record-requests`, governance review through `/govern/record-requests`, and founder search/list through `/admin/record-requests`.
- Founder Console now has a dedicated Record Requests section with search, status filters, open/escalated/fulfilled metrics, request detail review, and governance status updates connected to `/govern/record-requests/:id/review`.
- Credential signing now reports JOSE/JWS Ed25519 readiness, validates configured keypairs, and fails fast when configured signing keys are required but missing.
- Credential signing operator tooling now includes `npm run crypto:keygen`, `npm run crypto:validate`, and `docs/runbooks/credential-signing-keys.md`.
- Founder MFA recovery codes are supported as hashed, one-time backup codes with TOTP-protected rotation and one-time login consumption.
- Verification billing event writer is implemented for successful credential-reference checks when `ACADID_VERIFICATION_FEE_MINOR` is configured.
- Engineer 2 Institution Portal handoff is documented with product boundary, API contract, and sandbox verification script.
- Cross-engineer coordination is documented through `docs/handoffs/engineering-coordination.md` and `docs/handoffs/engineer-1-api-requests.md` so product engineers can request Data Center API roots without creating shadow schemas.
- Production operation runbooks now cover founder recovery, API key rotation, emergency lockdown, and credential signing keys.
- Institution Portal storage/MOU configuration is documented in `docs/runbooks/portal-storage-and-mou.md`, with `SUPABASE_STORAGE_BUCKET` aligned to API health and upload-ticket metadata.
- Dependency hardening notes are documented in `SECURITY_NOTES.md`, including direct vs transitive audit classification and major-upgrade paths for Nest/Next framework advisories.
- Platform foundation priority order is documented in `docs/platform-foundation-roadmap.md`; Engineer 1 should stabilize reliability systems before feature expansion.
- Webhook delivery worker transport is implemented: outbound webhook jobs are signed, carry idempotency headers, retry with exponential backoff, and move exhausted deliveries to failed/dead-letter state.
- Per-institution webhook endpoints are implemented with encrypted one-time secrets, secret rotation, endpoint status controls, endpoint-specific worker signing, and founder retry/replay APIs for webhook deliveries.
- Founder System Health now reports queue and worker health: ready backlog, scheduled jobs, running jobs, stale locks, failed jobs, queue breakdown, recent worker activity, and webhook delivery status from durable delivery rows.
- Persistent rate limiting is implemented with `RateLimitBucket`, `RateLimitService`, and `RateLimitGuard`; auth, token exchange, public verification, ingestion uploads, and portal intake are protected by database-backed counters.
- Rate-limit bucket operations are now maintainable: `/api/admin/rate-limits` exposes bucket summary/top scopes, `/api/admin/rate-limits/cleanup` queues a `RATE_LIMIT_BUCKET_CLEANUP` background job, the worker deletes stale buckets asynchronously, and Founder System Health includes bucket counts plus a cleanup control.
- Durable idempotency protection is implemented with `IdempotencyRecord`; job-producing flows can deduplicate by `x-idempotency-key` or automatic request fingerprints, with coverage for bulk uploads, async result validation, credential generation, PDF generation, and Paystack payment confirmation jobs.
- Public/gateway POST roots now have idempotency hooks for institution applications and learner record requests when clients send `x-idempotency-key`.
- Idempotency ledger maintenance is implemented: `/api/admin/idempotency-records` exposes summary/recent records, `/api/admin/idempotency-records/cleanup` queues `IDEMPOTENCY_RECORD_CLEANUP`, workers delete expired rows asynchronously, and Founder System Health includes idempotency metrics plus cleanup controls.
- Notification delivery transports are implemented for worker-driven email, SMS, and push notifications: Resend/SendGrid for email, Termii/Twilio for SMS, Expo push for mobile, and safe local dry-run when providers are not configured.
- Structured logging and error observability are implemented for the Data Center API: request logs emit JSON with request IDs, route, actor/client context, status, duration, and redacted metadata; HTTP failures and worker failures also write durable audit events.
- Safe read-through caching is implemented with `CacheService`: credential status, platform settings, and founder institution metadata now use short TTLs with tag invalidation; cache health is visible in Founder System Health.
- Distributed cache support is implemented with an in-process L1 cache plus optional Upstash Redis REST L2 adapter for multi-instance pilot/production deployments; configuration is documented in `docs/runbooks/distributed-cache.md`.
- Webhook receiver behavior is documented for partners in `docs/api/webhook-receiver-contract.md`, including HMAC signature verification, idempotency keys, retries, replay behavior, timestamp checks, and response rules.
- Engineer 1 remaining foundation work is tracked in `ENGINEER_1_BACKLOG.md` so Data Center, Gateway, Founder Console, and reliability tasks stay visible before Engineer 2/3/4 product expansion.
- Architecture v5 is reviewed and captured. It expands the system from 10 to 14 core entities and makes AcademicSession, AcademicStructure, assigned staff scopes, RolloverRecord, and richer ResultBatch governance the next Engineer 1 foundation.
- Architecture v5 schema foundation is implemented in Prisma and Supabase: AcademicSession, AcademicStructure, RolloverRecord, InstitutionUser assigned scopes, Departmental Officer role, expanded Enrolment statuses, and richer ResultBatch/AcademicRecord links.
- v5 Academic Setup API foundation is implemented under `/api/ingest`: AcademicSession create/list/update, AcademicStructure create/list/update, human-session-only setup writes, v5 ResultBatch intake fields, and assignedScopes carried in human auth tokens.
- v5 assigned staff scope enforcement is implemented in `AuthorityService` for academic structure targets and wired into result ingestion, so non-registrar human users can be blocked outside their assigned class/subject/department/course scope.
- v5 manual rollover API foundation is implemented under `/api/govern`: rollover preview reads eligible active enrolments, and rollover confirm writes approved `RolloverRecord` rows, updates the old enrolment state, creates the next active enrolment for promoted/repeated learners, and records audit events.
- v5 sealed-session reopen escalation is implemented under `/api/govern`: institutions can request an audited reopen, and only Founder Admin can approve or reject the request.
- Founder v5 Academic Operations visibility is implemented through `/api/admin/academic-operations` and a dedicated Founder Console page for setup health, active/sealed sessions, structure mix, rollover activity, sealed-session escalations, and institution flags.
- Verification events now capture verifier context with hashed IP addresses and encrypted verifier email values.
- Event-driven architecture foundation is implemented with durable `BackgroundJob`, `DomainEvent`, `WebhookDelivery`, and `Notification` models for bulk uploads, result validation, credential/PDF generation, SMS/email delivery, Paystack confirmation, record-request deadlines, callbacks, and push notifications.
- Async gateway roots now include `POST /api/ingest/bulk-upload`, `POST /api/ingest/results/async`, and safe light polling through `GET /api/jobs/:id`.
- Background worker runtime is implemented with database row-lock leasing, retry/failure handling, completion events, `npm run worker`, and `npm run worker:once`.
- Queued bulk student uploads now have CSV/XLSX parser support, common school-header mapping, validation against the student register schema, and non-retryable failure handling for malformed files.
- Worker-only object storage downloads are implemented for `storage://bucket/key` imports through Supabase REST or a configured internal download gateway, without exposing private storage credentials to browsers.

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
- RecordRequest.
- BackgroundJob.
- DomainEvent.
- WebhookDelivery.
- WebhookEndpoint.
- Notification.

### Web

The web app currently provides an operations dashboard for the first foundation workflow:

- Live Founder Console login.
- Live Founder Console authenticator-code field and security setup panel.
- Live institution list and creation form.
- Live institution detail staff access controls for founder-managed staff invitation, suspension/reactivation, TOTP requirement, default permission reset, and assigned-scope visibility.
- Live Authority Grant creation form.
- Live API key generation with one-time secret modal.
- Live selected-institution API key list and revocation action.
- Live global API key management with search, status filters, institution context, last-used display, and revocation action.
- Live product-level API key generation for internal AcadID products.
- Live institution application approval queue for Founder review.
- Live Developer Access Request queue backed by the Data Center API, including approve, reject, and suspend actions.
- Institution Live Results API key form now lists only institutions with approved Developer Access.
- Live Record Requests workflow for Founder review, including filtered registry, learner/institution context, proof-document count, payment status, and status transition notes.
- Live Disputes page backed by the Data Center API, with status filters, detail panel, founder assignment, institution notice text, escalation, and resolution notes.
- Live Verification Logs page backed by the Data Center API, with cross-institution search, outcome filters, metrics, and CSV export.
- Live System Health page backed by the Data Center API, with service status, gateway metrics, and recent incidents.
- Live Revenue page backed by the Data Center API, with ledger totals, subscription status, recent entries, and CSV export.
- Live Settings page backed by the Data Center API, with editable approval rules, API defaults, notifications, and email template subjects.
- Live Security page includes founder recovery-code status and TOTP-protected rotation with one-time display.
- Live Security page includes login history, API key security logs, founder audit trail, and guarded emergency lockdown.
- Audit events now include v4 gateway trace context: request ID, actor type, actor user ID, API client ID, role, endpoint, HTTP method, entity alias, hashed IP, and hashed user-agent signals.
- Founder password recovery command is available through `npm run founder:reset-password`, with generated one-time password support, optional MFA clearing, super-admin-only guardrails, and audit logging.
- Live Overview page now uses backend aggregate metrics, audit events, gateway usage, institution status distribution, and live system-health data.
- Live API Keys page can regenerate existing keys and show the new secret once.
- Institution Applications page can request more information and record application email actions.
- Institution application approval now surfaces a one-time Registrar invite token so sandbox onboarding can move into the v4 human-session Institution Portal model.
- Institution Portal API now exposes current MOU version metadata and scoped upload-ticket issuance for registration documents, signed MOU files, and supporting documents.
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
- Founder institution staff control validates with `npm run typecheck` and `npm test`; tests cover secret-safe staff listing plus audited status/permission/scope updates.
- Developer Access Request workflow validates with `npm run typecheck`, `npm test`, `npm run db:deploy`, `npm run smoke:api`, and browser verification in the Founder Console.
- Dispute workflow validates with `npm run typecheck`, `npm test`, `npm run db:deploy`, authenticated `/api/admin/disputes` check, and browser verification in the Founder Console.
- Founder Verification Logs workflow validates with `npm run typecheck`, `npm test`, and authenticated `/api/admin/verification-logs` check.
- Founder System Health workflow validates with `npm run typecheck`, `npm test`, and authenticated `/api/admin/system-health` check.
- Founder Revenue workflow validates with `npm run typecheck`, `npm test`, `npm run db:deploy`, and authenticated `/api/admin/revenue` check.
- Founder Settings workflow validates with `npm run typecheck`, `npm test`, `npm run db:deploy`, authenticated `/api/admin/settings` read/save checks, and browser verification in the Founder Console.
- Credential signing readiness validates with `npm run typecheck`, `npm test`, and authenticated `/api/admin/system-health`; local development reports `Credential Signing` as degraded until stable deployment keys are configured.
- Credential signing operator tooling validates with `npm run crypto:keygen` shape checks and `npm run crypto:validate` failure checks when configured keys are missing.
- Live Supabase smoke validation passes with `npm run smoke:api`: founder login, institution creation, developer access approval, API key auth, learner ingestion, result publishing, credential issuance, and credential verification.
- Founder MFA recovery workflow validates with `npm run typecheck`, `npm test`, `npm run db:deploy`, and authenticated `/api/auth/mfa/recovery-codes` status check.
- Verification billing writer validates with `npm run typecheck`, `npm test`, and local API health checks; billing stays disabled when `ACADID_VERIFICATION_FEE_MINOR` is not configured.
- Founder dashboard completion validates with `npm run typecheck`, `npm test`, local web/API 200 checks, and authenticated `/api/admin/dashboard-summary` plus `/api/admin/audit-events` checks.
- v4 InstitutionUser auth/invite foundation validates with `npm run typecheck`, `npm test`, and `npm run db:deploy`; Supabase migration `20260505000000_v4_institution_user_auth` is applied.
- v4 audit trace context validates with `npm run db:generate`, `npm run typecheck`, `npm run db:deploy`, `npm test`, local web/API 200 checks, and authenticated `/api/admin/audit-events?search=acadid-local-audit-check-2`; Supabase migration `20260505020000_v4_audit_event_context` is applied.
- Founder password recovery command validates with `npm run typecheck`, `npm test`, and missing-password guard checks; the command writes `founder.password.reset` audit events when executed.
- Institution Portal MOU/upload-ticket endpoints validate with `npm run typecheck`, `npm test`, public `/api/portal/mou-version`, and scoped `/api/portal/upload-urls` checks.
- Engineer 2 Institution Portal handoff is documented in `docs/handoffs/engineer-2-institution-portal.md`, `docs/api/institution-portal-contract.md`, and `docs/handoffs/engineer-2-sandbox-test.md`.
- Engineer coordination and operation runbook docs are in place for cross-team API requests, founder recovery, API key rotation, emergency lockdown, and signing key readiness.
- Portal storage/MOU config docs and environment placeholders are in place; API health recognizes `SUPABASE_STORAGE_BUCKET`, `OBJECT_STORAGE_BUCKET`, or `STORAGE_BUCKET`.
- Architecture Brief v5 is reviewed into `docs/architecture-brief-v5-memory.md`.
- v5 academic operations migration `20260507000000_v5_academic_operations` is applied to Supabase and validates with `npm run db:generate`, `npm run typecheck`, `npm test`, `npm run db:deploy`, and `npm run smoke:api`.
- v5 Academic Setup API validates with `npm run typecheck`, `npm test`, and `npm run smoke:api`; contract is documented in `docs/api/v5-academic-setup-contract.md`.
- Event-driven jobs migration `20260508000000_event_driven_jobs` is applied to Supabase and validates with `npm run db:generate`, `npm run typecheck`, `npm test`, `npm run db:deploy`, and `npm run smoke:api`; contract is documented in `docs/api/event-driven-jobs-contract.md`.
- Background worker runtime validates with `npm run typecheck`, `npm test`, and local `npm run worker:once`.
- Bulk upload parser coverage validates CSV header mapping, quoted CSV values, XLSX content, and malformed-file rejection.
- Object storage coverage validates `storage://bucket/key` parsing, download-base authorization, and parser integration.
- Dependency hardening review validates with `npm audit --omit=dev --json`, `npm run typecheck`, `npm test`, and `npm run smoke:api`; no blind `npm audit fix --force` was run.
- Security upgrade plan is documented in `SECURITY_UPGRADE_PLAN.md`; no major framework upgrade was applied on `main`.
- Platform foundation checkpoint validates with `npm run typecheck`, `npm test`, `npm run smoke:api`, and `npm run worker:once`.
- Worker and queue health checkpoint validates with `npm run typecheck`, `npm test`, `npm run smoke:api`, and `npm run worker:once`.
- Persistent rate limiting checkpoint validates with `npm run db:deploy`, `npm run typecheck`, `npm test`, `npm run smoke:api`, and `npm run worker:once`.
- Structured logging and error-observability checkpoint validates with `npm run typecheck` and `npm test`; coverage confirms secret redaction, HTTP error capture, and worker error audit logging.
- Safe caching checkpoint validates with `npm run typecheck`, `npm test`, `npm run worker:once`, and `npm run smoke:api`; coverage confirms TTL hits, tag invalidation, credential-status cache invalidation, and platform-settings cache invalidation.
- Webhook endpoint controls checkpoint validates with `npm run db:generate`, `npm run db:deploy`, `npm run typecheck`, `npm test`, `npm run smoke:api`, and `npm run worker:once`; coverage confirms one-time endpoint secret creation, endpoint-secret signing, delivery retry, and delivery replay.
- Assigned-scope enforcement validates with `npm run typecheck` and `npm test`; coverage includes matching scopes, out-of-scope denial, and academic structure ancestor matching.
- v5 manual rollover API typechecks locally; tests cover preview, promotion confirmation, missing target-session rejection, and machine-key blocking.
- v5 sealed-session reopen escalation tests cover registrar escalation, founder approval, and non-founder review blocking.
- Founder Academic Operations summary has unit coverage for v5 aggregate counts, institution readiness flags, recent rollover data, and sealed-session escalation events.
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

- `npm audit --omit=dev` still reports Nest/Next framework advisories that require planned major upgrades; details and test impact are documented in `SECURITY_NOTES.md`. Do not run force fixes blindly.
- Docker PostgreSQL is no longer required for normal development. It remains available only as an optional local fallback.
- Architecture v3.1 changes the MVP API key model: internal AcadID products get API keys first; institutions register through the Institution Portal and only later request optional API access.
- Prisma migrate may still print a Supabase schema-engine warning, but the repository fallback migration runner applies pending migrations successfully.
- On April 30, 2026, local Supabase runtime checks briefly returned Prisma `P1001` connection errors to the pooler even though the TCP port was reachable. Connectivity later recovered, and authenticated Verification Logs, System Health, Revenue, and Settings checks returned 200.
- On May 1, 2026, local System Health correctly reports `Credential Signing` as `DEGRADED` because development is using an ephemeral signing key. This is expected until real deployment secrets are provisioned.
- On May 1, 2026, Architecture Brief v4 was reviewed. It supersedes v3/v3.1 for the next Engineer 1 work: add/expand InstitutionUser human staff auth, RecordRequest, workspace isolation middleware, stronger audit fields, registrar invitation on approval, and record-request intelligence in the Founder Console.

## Local Runtime

Web app:

- Running at `http://localhost:3000`.

API app:

- Running at `http://localhost:4000` after Supabase settings are present in root `.env`, migrations are applied, and seed data exists.

## Next Engineering Steps

1. Add notification delivery dashboards, provider health checks, and failed notification retry controls.
2. Define worker deployment topology and heartbeat design for multi-worker production.
3. Add a central retry policy module by job type, including jitter.
4. Add dead-letter queue/listing for operator review.
5. Add per-institution and per-product rate-limit defaults plus emergency overrides.
6. Execute the planned Nest/Next dependency hardening upgrades from `SECURITY_NOTES.md` and `SECURITY_UPGRADE_PLAN.md` before production.

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
