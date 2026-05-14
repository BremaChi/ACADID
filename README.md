# AcadID

AcadID is a permanent academic identity infrastructure for Nigeria. It gives every learner a lifelong Academic Identity Number (AIN), stores institutional academic history in a stable core data center, and exposes credentials through controlled gateway services.

## Architecture Source Of Truth

The current authoritative source is:

- `C:\Users\HP\Downloads\AcadID_Architecture_Brief_v5 (1).docx`

Current implementation memory:

- `docs/architecture-brief-v4-memory.md`
- `docs/architecture-brief-v5-memory.md`

Engineer handoff documents:

- `ENGINEER_1_BACKLOG.md`
- `docs/handoffs/engineer-2-institution-portal.md`
- `docs/api/institution-portal-contract.md`
- `docs/handoffs/engineer-2-sandbox-test.md`
- `docs/api/webhook-receiver-contract.md`

Earlier note:

- `C:\Users\HP\Downloads\Acadid Architecture Brief Cleaned.docx` remains useful historical context.
- `D:\ACADID\AcadID_Architecture_Brief.html` exists but reads as all zero bytes in this environment.
- `D:\ACADID\AcadID_Authority_Partnership_Brief-1.docx` remains useful for partnership and registrar-facing positioning.

## Review Packet

The updated technical architecture packet is in:

- `architecture-review/00-review-brief.md`
- `architecture-review/01-mvp-architecture.md`
- `architecture-review/02-data-and-interfaces.md`
- `architecture-review/03-security-privacy-governance.md`
- `architecture-review/04-threat-model.md`
- `architecture-review/05-acceptance-test-plan.md`
- `architecture-review/06-review-agenda.md`

## Permanent Architecture Decisions

- Layer 0: Core Data Center.
- Layer 1: Controlled Gateway.
- Layer 2: Product Layer.
- Layer 3: External Partner Ecosystem.
- Every product talks to the core only through the gateway.
- Every learner has an internal UUID and a public AIN.
- Published academic records are immutable; amendments create versions.
- Credentials are issued as W3C Verifiable Credentials Data Model 2.0 payloads.
- Student sharing is controlled through scoped, revocable Access Grants.
- Institution authority is controlled through Authority Grants created from signed MOUs.
- Nigeria data residency and no individual data monetisation are product commitments.

## First Build Bias

Build the data center, gateway, auth, audit, Authority Grant workflow, Internal Admin Panel, and Institution Upload Portal before expanding to student mobile, employer verification, exam body APIs, and live score APIs.

## Runtime Notes

PostgreSQL remains the production database choice. Supabase PostgreSQL is now the active development database, connected through the backend API with `DATABASE_URL` and `DIRECT_URL` in the root `.env`.

Docker PostgreSQL is optional local fallback only, not part of the normal development workflow.

For local Supabase development, use a Supabase PostgreSQL route that supports Prisma runtime traffic for `DATABASE_URL` and keep `DIRECT_URL` as the migration connection. On this machine, the working runtime route uses the Supabase pooler with `pgbouncer=true`, `connection_limit=10`, and `pool_timeout=30` so the Founder Console can load multiple control-plane panels without queueing behind a single database connection.

See `docs/runtime-options.md` for the available local and production database setup options.

Useful commands:

- `npm run db:generate`
- `npm run db:deploy`
- `npm run db:seed`
- `npm run smoke:api`
- `npm run crypto:keygen`
- `npm run crypto:validate`

Webhook worker delivery:

- Start workers with `npm run worker` or one pass with `npm run worker:once`.
- Set `ACADID_WORKER_ID` in production so each worker instance has a stable identity, for example `worker-ingest-01` or `worker-webhook-01`.
- Workers write durable heartbeats to `WorkerHeartbeat` with queues, concurrency, active/stale/stopped status, current job hints, and last-seen timestamps.
- Founder System Health shows worker active/stale/stopped counts and the recent worker registry, which is required before scaling many worker processes.
- Retry timing is centralized in `RetryPolicyService`; each job type has explicit max attempts, capped exponential backoff, and jitter so large batches do not retry together.
- Failed exhausted work is visible through `GET /api/admin/dead-letters`; Founder admins can requeue failed background jobs with `POST /api/admin/dead-letters/jobs/:id/retry`.
- Configure `ACADID_WEBHOOK_SECRET` before enabling outbound webhook jobs.
- The worker signs each delivery with `x-acadid-signature`, sends a stable `x-acadid-idempotency-key`, retries with exponential backoff, and marks exhausted deliveries as failed for operator review.
- Prefer institution-scoped webhook endpoints created through the Founder API; each endpoint receives a one-time `whsec_...` secret, stores only an encrypted copy, and signs deliveries with that endpoint secret.
- Founder APIs can rotate endpoint secrets, suspend/disable endpoints, retry failed deliveries with the same idempotency key, or replay an existing delivery as a new idempotency key.
- `ACADID_WEBHOOK_SECRET` remains a legacy fallback for webhook delivery rows without a configured endpoint.
- `ACADID_WEBHOOK_TIMEOUT_MS` controls the outbound delivery timeout, capped at 30 seconds.
- Receiver verification, idempotency, replay, and response rules are documented in `docs/api/webhook-receiver-contract.md`.

Rate limiting:

- API key traffic uses persistent PostgreSQL counters from the token's `rateLimitPerMinute`.
- Founder-controlled rate policy is stored in `PlatformSetting.rateLimits` and is enforced by `RateLimitService`.
- Product API keys can use product defaults for Institution Portal, Student App, Employer Verification Portal, and Exam Body API.
- Institution API keys can use sandbox/production defaults plus institution-specific overrides.
- Emergency throttle mode caps API-key and route-level limits quickly without revoking keys; use it for incident response and traffic spikes.
- Auth, token exchange, public verification, upload, and portal-intake routes use `RateLimitBucket` rows so limits work across API processes.
- Rate-limit buckets store hashed keys rather than raw IP/body identifiers.
- Founder admins can inspect bucket activity at `GET /api/admin/rate-limits`, manage policy at `GET/PATCH /api/admin/rate-limits/policy`, and queue asynchronous retention cleanup through `POST /api/admin/rate-limits/cleanup`.
- Cleanup runs as the `RATE_LIMIT_BUCKET_CLEANUP` background job on the `platform.maintenance` queue, so HTTP requests return quickly with a job ID.

Idempotency:

- Clients should send `x-idempotency-key` on retryable POST requests.
- AcadID stores only hashed idempotency keys in `IdempotencyRecord`; raw keys are not persisted.
- Job-producing operations replay the original job response for duplicate keys and reject key reuse with a different request payload.
- Bulk uploads, async result validation, credential generation, PDF generation, and Paystack confirmation jobs also receive automatic request-fingerprint protection for accidental duplicate enqueues.
- Institution application and learner record-request POST flows use the same idempotency ledger when clients provide `x-idempotency-key`.
- Founder admins can inspect ledger health at `GET /api/admin/idempotency-records` and queue asynchronous retention cleanup through `POST /api/admin/idempotency-records/cleanup`.
- Cleanup runs as the `IDEMPOTENCY_RECORD_CLEANUP` background job on the `platform.maintenance` queue, so HTTP requests return quickly with a job ID.

Caching:

- `CacheService` provides conservative short-TTL caching for safe read-heavy surfaces.
- Cached surfaces currently include credential status, platform settings, and founder institution metadata.
- Do not cache API secrets, share-token verification payloads, unconsented learner records, or private student data.
- Local development defaults to in-process memory cache.
- Multi-instance pilot/production can enable the optional Upstash Redis REST L2 adapter with `ACADID_CACHE_ADAPTER=upstash`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`.
- See `docs/runbooks/distributed-cache.md`.

Observability:

- The API emits structured JSON logs for gateway requests with `x-request-id`, route, actor/client context, status, and duration.
- HTTP failures and worker failures are captured by `ErrorObservabilityService` and also written as durable audit events.
- Log metadata is redacted for passwords, secrets, tokens, authorization material, credentials, private keys, NIN, and BVN fields.

Notifications:

- `SMS_EMAIL_DELIVERY` and `PUSH_NOTIFICATION` jobs now use `NotificationDeliveryService`.
- Email supports Resend via `RESEND_API_KEY` or SendGrid via `SENDGRID_API_KEY`.
- SMS supports Termii via `TERMII_API_KEY` or Twilio via `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`.
- Push supports Expo push tokens through the Expo push API.
- Local development defaults to safe dry-run for email/SMS when providers are not configured; set `ACADID_REQUIRE_NOTIFICATION_PROVIDER=true` in production-like environments.
- Notification destinations can come from the related user/learner record or from notification payload fields such as `email`, `phone`, `pushToken`, or `expoPushToken`.
- Founder System Health shows notification provider status, delivery counts, channel breakdown, and recent failed notifications.
- Failed email/SMS/push notifications can be retried through `POST /api/admin/notifications/:id/retry`; retries queue background jobs and write audit events.

Credential signing:

- Local development may run with an ephemeral Ed25519 key and will show Credential Signing as degraded.
- Pilot/production must configure `CREDENTIAL_SIGNING_PRIVATE_KEY_PEM`, `CREDENTIAL_SIGNING_PUBLIC_KEY_PEM`, `CREDENTIAL_SIGNING_VERIFICATION_METHOD`, and `ACADID_REQUIRE_CONFIGURED_SIGNING_KEYS=true`.
- See `docs/runbooks/credential-signing-keys.md`.

Engineering coordination:

- Product engineers should build against the Data Center API, not direct Supabase tables.
- Use `docs/handoffs/engineering-coordination.md` for cross-engineer rules.
- Use `docs/handoffs/engineer-1-api-requests.md` when another product needs a new backend root, field, scope, or route.

Portal storage and MOU:

- Institution Portal document upload metadata is controlled through the Data Center API.
- Preferred pilot bucket env is `SUPABASE_STORAGE_BUCKET`.
- Founder System Health checks object-storage download readiness. Set `ACADID_OBJECT_STORAGE_HEALTHCHECK_URL=storage://bucket/path/to/probe.txt` to verify real worker downloads without exposing signed URLs or object keys.
- See `docs/runbooks/portal-storage-and-mou.md`.

Monitoring and operations:

- `ACADID_LOG_SINK_URL` can mirror already-redacted structured JSON logs to an external HTTP collector. Use `ACADID_LOG_SINK_BEARER_TOKEN` for collector auth.
- Alert thresholds are configurable with `ACADID_ALERT_GATEWAY_ERROR_RATE_PERCENT`, `ACADID_ALERT_READY_BACKGROUND_JOBS`, `ACADID_ALERT_PENDING_WEBHOOKS`, `ACADID_ALERT_FAILED_BACKGROUND_JOBS_24H`, and `ACADID_ALERT_FAILED_WEBHOOKS_24H`.
- Founder System Health shows cache hit/miss/load metrics, Log Sink status, webhook endpoint controls, and delivery retry/replay controls.

Founder sign-in:

- Open `http://localhost:3000`.
- Use the seeded founder email `founder@acadid.local`.
- Use `SEED_SUPER_ADMIN_PASSWORD` from your local `.env`; the default example value is `ChangeMe123!`.
- Leave the authenticator-code field empty until TOTP is enabled from the Founder Security panel.

Founder password recovery for local development/pilot ops:

- Generate a one-time replacement password with `npm run founder:reset-password -- --generate`.
- If authenticator access is lost, add `--clear-mfa`.
- To set a specific password without printing it in command output, set `FOUNDER_NEW_PASSWORD` in the current shell and run `npm run founder:reset-password`.
- The recovery command uses `DIRECT_URL` when available, because it is an operator task rather than normal API runtime traffic.
- The command refuses to reset non-founder users and writes a `founder.password.reset` audit event.

Current v3 checkpoint:

- Founder can create an institution and Authority Grant.
- Founder can review Developer Access Requests and approve optional institution Live Results API access.
- Founder can generate internal product API keys.
- Founder can generate institution Live Results API keys only after Developer Access is approved.
- Founder can review, assign, escalate, notify institutions about, and close disputes from the Data Center-backed Disputes workflow.
- Founder can view cross-institution credential verification logs with search, outcome filters, and CSV export.
- Founder can view live System Health and gateway metrics from the Data Center API.
- Founder can view Revenue from a real ledger foundation for verification fees, credential exports, and institution subscriptions.
- Founder can manage persisted platform settings for approval rules, API defaults, notifications, and email template subjects.
- Founder can view backend-backed dashboard summary metrics, seven-day gateway usage, latest audit events, and live institution status distribution.
- Founder can regenerate API keys with one-time secret display and audit logging.
- Founder can request more information from institution applications and record application email actions for provider delivery.
- Founder Security includes login/audit history plus guarded emergency lockdown that revokes active API keys.
- Institution staff human auth foundation is available through `/auth/user/login`, `/auth/user/invite`, `/auth/user/accept-invite`, `/auth/user/me`, and `/auth/user/logout`.
- Founder can manage institution staff through `/api/admin/institutions/:id/staff`, `/api/admin/institutions/:id/staff/invite`, and `/api/admin/institution-staff/:id`; product teams should use these Data Center roots instead of writing staff assignments directly to Supabase.
- Founder institution approval now creates a Registrar invitation so approved schools can move into the v4 human-session workspace model.
- Credential signing uses JOSE/JWS Ed25519 readiness checks and reports whether stable deployment keys are configured.
- Founder MFA supports hashed one-time recovery codes with TOTP-protected rotation and recovery-code login fallback.
- Successful credential-reference verification can write billable revenue ledger events when `ACADID_VERIFICATION_FEE_MINOR` is configured.
- Founder Console connects to the live API for institution/key workflows.
- Founder can search, filter, and revoke API keys across all institutions from one global table.
- Founder can set up authenticator-code protection; once enabled, login requires the authenticator code.
- External clients can exchange `client_id` and one-time `client_secret` through `POST /auth/token`.
- Scoped API clients can ingest and govern records through the gateway without direct database access.
- Founder Console uses the ACAD.ID symbol asset from `apps/web/public/acadid-symbol.png`.
- Engineer 2 Institution Portal handoff is documented with API contract and sandbox test script.

Current v4 architecture update:

- `docs/architecture-brief-v4-memory.md` is now the active architecture memory for Engineer 1 next work.
- v4 keeps the four-layer Data Center/Gateway/Product/Partner model and Supabase PostgreSQL path.
- v4 adds mandatory institution workspace isolation, human InstitutionUser sessions, expanded audit logging, and Graduate Record Requests.
- Normal institution dashboard actions must be attributed to human staff users, not only to a shared product API key.
- Workspace scoping utilities and active human membership checks are now implemented in the Data Center API.
- Human institution permissions are enforced through gateway scope guards for protected actions.
- RecordRequest schema/API foundation is implemented for learner submission, institution/founder governance review, founder search, audit events, and Supabase migration.
- Founder Console Record Request UI is implemented with a dedicated sidebar section, search/filter, detail review, and governance status updates.
- The next build priority is expanded audit fields and updating Engineer 2 handoff docs for product-key plus human institution sessions.
