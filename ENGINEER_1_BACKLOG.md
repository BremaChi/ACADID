# Engineer 1 Backlog

Engineer 1 owns the AcadID Data Center, Gateway, founder control plane, security foundation, reliability systems, and cross-product API roots.

## Active Build Order

1. Finish the framework-upgrade branch validation and merge path.
2. Keep Founder Console/Data Center reliability sharp while Engineer 2 begins Institution Portal work.
3. Add new gateway API roots only when a product engineer needs them and document the request/response contract.

## v5 Implementation Gaps To Track

- Planned Nest/Next dependency hardening upgrades from `SECURITY_NOTES.md` and `SECURITY_UPGRADE_PLAN.md` before production.
- Refund-processing flows for paid RecordRequests.
- Production-scale database strategy: partitioning, read replicas, high-volume indexes, and verification/event retention policy.
- Deeper Institution Portal UI workflows are Engineer 2 scope, but Engineer 1 must support any missing Data Center roots.

## Product API Roots To Keep Stable

- Founder Console must use Data Center API routes only.
- Institution Portal must use product API keys plus human institution sessions.
- Student, employer, exam-body, and live-score products must not read or write Supabase tables directly.
- New product needs should be added to `docs/handoffs/engineer-1-api-requests.md` before implementation.

## Completed Engineer 1 Checkpoints

- Supabase PostgreSQL migration and runtime posture.
- Founder Console routed control surface.
- Product and institution API key lifecycle.
- Developer Access Request governance.
- W3C VC-ready credential signing with Ed25519 JOSE/JWS.
- Event-driven job foundation and worker runtime.
- Webhook delivery with signatures, retries, and replay controls.
- Persistent rate limiting.
- Durable idempotency ledger for retryable POST/job-producing flows.
- Notification delivery transports for email, SMS, and push.
- Institution staff invitation, status, permissions, TOTP requirement, assigned scopes, and Founder Console controls.
- Distributed cache adapter with in-process L1 and optional Upstash Redis REST L2.
- Webhook receiver contract for partners, including signature verification, idempotency, retries, and replay handling.
- Idempotency cleanup/retention job, Supabase migration, API visibility endpoint, System Health component, and Founder Console maintenance controls.
- Notification delivery dashboard in Founder System Health, provider health checks, failed-notification retry API, and retry audit events.
- Worker heartbeat registry for multi-worker production, including active/stale/stopped counts and Founder System Health visibility.
- Central retry policy module by job type, including capped exponential backoff and jitter.
- Dead-letter listing and retry controls for failed background jobs, failed webhook deliveries, and failed notifications.
- Per-product and institution default rate-limit policy, emergency throttle cap, Founder Console controls, and audit trail.
- Supabase/object-storage download health check, optional probe object, timeout guard, and Founder System Health visibility.
- Error alert thresholds, external HTTP log sink adapter, and Log Sink System Health visibility.
- Founder Console UI for webhook endpoint setup, one-time secret display, secret rotation, endpoint status control, delivery retry, and replay.
- Cache hit/miss/load metrics with Founder System Health visibility.
- Invitation leads for unregistered institutions with graduate demand are implemented with Supabase schema, RecordRequest auto-capture, founder list/update APIs, audit logging, tests, and Founder Academic Operations controls.
- Registrar-facing staff assigned-scope management is implemented for the Institution Portal through `/api/portal/staff`, `/api/portal/staff/scope-options`, `/api/portal/staff/invite`, and `/api/portal/staff/:id`, with human-session enforcement, no machine-key access, audit logging, and contract docs for Engineer 2.
- Modular grading rule sets are implemented as Data Center entities with `/api/ingest/grading-rules` create/list/update endpoints, score-to-grade computation during result ingestion, tertiary GPA summary support, W3C VC payload grade-point fields, audit logging, Supabase schema sync, tests, and `docs/api/grading-rules-contract.md`.
- RecordRequest payment escrow and fulfillment are implemented with explicit escrow state, payment confirmation, signed credential publication into the learner passport, payment release revenue ledger entries, audit logging, Supabase migration, tests, and `docs/api/record-request-fulfillment-contract.md`.
- Transfer workflows and disputed rollover surfaces are implemented with durable `TransferRequest` state, transfer IDs, source-enrolment transfer-out updates, linked `TRANSFERRED_OUT` rollover records, rollover-linked disputes, Founder Academic Operations visibility, audit logging, Supabase migration, tests, and `docs/api/transfer-and-rollover-disputes-contract.md`.
- Founder v5 setup-health gaps are implemented in `/api/admin/academic-operations` and the Founder Console, covering missing grading rules, missing subjects/courses, incomplete staff assignments, slow/failed validation or upload jobs, storage object counts, transfer alerts, disputed rollovers, tests, and UI visibility.
- Paystack webhook receiver/worker automation is implemented for RecordRequest payment confirmation, with signed webhook verification, background job handoff, escrow state update, idempotent worker behavior, audit logging, tests, and `docs/api/paystack-webhook-contract.md`.
- CGPA/classification rollup is implemented as durable `AcademicStanding` state per enrolment, recomputed during result publication, exposed through `/api/access/academic-standing`, covered by tests, and documented in `docs/api/academic-standing-contract.md`.
- Institution Portal dashboard handoff tests are implemented for Engineer 2 approved-institution flows, covering staff scopes, academic setup, async upload polling roots, transfer, manual rollover, disputed rollover, sealed-session reopen, and record request routes through `tests/institution-portal-handoff.test.mjs` and `docs/handoffs/engineer-2-approved-institution-dashboard.md`.
- Database-backed sealed-session reopen queue is implemented with durable `SealedSessionReopenRequest` state, one-open-request-per-session protection, 72-hour SLA due dates, Founder approval/rejection review fields, Supabase migration, audit events, and Founder Academic Operations visibility.
- Public bulk verification and AIN lookup are implemented under `/api/verify`, with safe learner summaries, no internal UUID exposure, rate-limited routes, verification events, tests, and `docs/api/public-verification-contract.md`.
