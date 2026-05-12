# Engineer 1 Backlog

Engineer 1 owns the AcadID Data Center, Gateway, founder control plane, security foundation, reliability systems, and cross-product API roots.

## Active Build Order

1. Worker deployment topology and heartbeat design for multi-worker production.
2. Central retry policy module by job type, including jitter.
3. Dead-letter queue/listing for operator review.
4. Per-institution and per-product rate-limit defaults and emergency overrides.
5. Supabase storage download health check.
6. Error alert thresholds and external log sink adapter.
7. Founder Console UI for webhook endpoint setup, secret rotation, retry, and replay.
8. Cache hit/miss metrics once external monitoring is connected.

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
