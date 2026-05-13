# Engineer 1 Backlog

Engineer 1 owns the AcadID Data Center, Gateway, founder control plane, security foundation, reliability systems, and cross-product API roots.

## Active Build Order

1. Begin v5 Engineer 1 implementation gaps in the order below.

## v5 Implementation Gaps To Track

- Founder Console v5 setup-health gaps: missing grading rules, missing subjects/courses, incomplete staff assignments, slow validation jobs, and storage use.

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
