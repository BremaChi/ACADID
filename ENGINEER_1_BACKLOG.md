# Engineer 1 Backlog

Engineer 1 owns the AcadID Data Center, Gateway, founder control plane, security foundation, reliability systems, and cross-product API roots.

## Active Build Order

1. Error alert thresholds and external log sink adapter.
2. Founder Console UI for webhook endpoint setup, secret rotation, retry, and replay.
3. Cache hit/miss metrics once external monitoring is connected.

## v5 Implementation Gaps To Track

- Registrar-facing staff assigned-scope management inside Institution Portal.
- Modular result engines and configured grading rules, including GPA/CGPA for tertiary records.
- Invitation leads for unregistered institutions with graduate demand.
- RecordRequest payment escrow/release and publication into learner passport.
- Transfer workflows and disputed rollover surfaces.
- Founder Console v5 setup-health gaps: missing grading rules, missing subjects/courses, incomplete staff assignments, slow validation jobs, storage use, and invitation leads.

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
