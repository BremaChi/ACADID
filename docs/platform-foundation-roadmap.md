# AcadID Platform Foundation Roadmap

AcadID is academic identity infrastructure, not only an app. Feature work must build on platform reliability, security, and operational visibility before product expansion.

## Priority Order

1. Event bus / queue system
2. Webhook delivery system
3. Retry policies
4. Idempotency protection
5. Structured audit logging
6. Background workers
7. Monitoring and health checks
8. Rate limiting
9. Caching strategy
10. Error observability

## Current State

### 1. Event Bus / Queue System

Implemented foundation:

- `BackgroundJob` table.
- `DomainEvent` outbox table.
- Job creation through `QueueService`.
- Async roots for bulk upload and result validation.
- Safe polling through `GET /api/jobs/:id`.

Remaining:

- Dedicated domain event publisher loop.
- Dead-letter event handling.
- Event subscription registry for internal processors.

### 2. Webhook Delivery System

Implemented foundation:

- `WebhookDelivery` table.
- Signed payload generation.
- Delivery attempts through worker transport.
- Exponential backoff.
- Exhausted deliveries move to failed/dead-letter state.
- Idempotency headers for receivers.
- Per-target delivery logs.
- `WebhookEndpoint` table for institution-scoped targets.
- Encrypted per-endpoint webhook secrets with one-time display and rotation.
- Endpoint-specific worker signing through `x-acadid-webhook-endpoint`.
- Founder retry controls for failed/pending deliveries.
- Founder replay controls that create a new delivery and idempotency key from an existing payload.

Required next:

- Webhook receiver documentation for partners.
- Founder Console UI surfaces for endpoint setup, secret rotation, retry, and replay.

### 3. Retry Policies

Implemented foundation:

- Worker retry/failure handling.
- Retry status and run-after scheduling.
- Non-retryable errors for malformed imports.
- Exponential backoff for worker retry scheduling.
- Webhook dead-letter state after exhausted attempts.
- Founder retry/replay APIs for operator-controlled webhook recovery.

Required next:

- Central retry policy module by job type.
- Retry jitter.
- Dedicated dead-letter queue/listing for operator review.
- Founder Console controls for dead-letter review.

### 4. Idempotency Protection

Implemented partial protection:

- Credential publication avoids duplicated credential refs in normal publish flow.
- API keys have one-time secret behavior.
- Worker leases jobs with database row locks.
- Webhook deliveries send stable `x-acadid-idempotency-key` values.

Required next:

- `IdempotencyKey` model or request-key fields for public/gateway operations.
- Idempotency enforcement for webhooks, payment confirmation, credential generation, PDF generation, and bulk import replay.
- Unique constraints for external event IDs such as Paystack references and exam-body callback IDs.

### 5. Structured Audit Logging

Implemented foundation:

- `AuditEvent` with actor, role, request, endpoint, entity, institution, IP/user-agent hashes.
- Audit interceptor for API requests.
- Explicit audit writes for sensitive workflows.

Required audit coverage must remain mandatory for:

- Result publication.
- Amendments.
- Credential revocation.
- Rollover confirmation.
- Transfer confirmation.
- Role assignment changes.
- API key creation/revocation/regeneration.
- Institution approval/suspension.
- Emergency lockdown.

### 6. Background Workers

Implemented foundation:

- `npm run worker`.
- `npm run worker:once`.
- Worker row-lock leasing.
- Bulk upload parser for CSV/XLSX.
- Worker-only object storage downloads.
- Result-batch validation job processor.

Required next:

- Worker deployment topology.
- Separate named queues if load increases.
- Worker heartbeat/last-seen tracking.
- Worker metrics in System Health.

### 7. Monitoring And Health Checks

Implemented foundation:

- API health route.
- Founder System Health endpoint/page.
- Database connectivity status.
- Storage config status.
- Credential signing readiness.
- Background queue metrics: ready backlog, scheduled backlog, running jobs, failed jobs, stale running jobs, queue breakdown, and recent worker activity.
- Webhook delivery metrics: pending/retrying, due now, delivered in 24h, failed in 24h, signing-secret readiness, and status breakdown.

Required next:

- Dedicated worker heartbeat table if multiple worker pools are deployed.
- Supabase storage download health.
- Error-rate windows by route and queue.

### 8. Rate Limiting

Implemented foundation:

- API key bearer-token rate limit from token metadata.
- Persistent `RateLimitBucket` table for distributed counters.
- Database-backed `RateLimitService` and `RateLimitGuard`.
- Public/auth route throttling for founder login, institution user login, invite acceptance, password reset placeholder, token exchange, and credential verification.
- Upload/intake throttling for student ingestion, result ingestion, async result validation, bulk upload, portal upload URLs, and institution applications.
- Founder API controls for rate-limit visibility through `/api/admin/rate-limits`.
- Async stale-bucket retention through `RATE_LIMIT_BUCKET_CLEANUP` jobs on `platform.maintenance`.
- Founder System Health shows bucket totals, stale buckets, recent requests, top scopes, and a cleanup queue button.

Required next:

- Per-institution and per-product limits.
- Founder Console controls for emergency rate-limit overrides.

### 9. Caching Strategy

Implemented foundation:

- `CacheService` provides short-TTL read-through caching, tag invalidation, prefix invalidation, and runtime stats.
- Public credential status uses a 30-second cache and can be invalidated by credential reference tag.
- Platform settings use a 60-second cache and are invalidated immediately after founder settings updates.
- Founder institution metadata uses a 20-second cache and is invalidated after institution creation, status changes, and application approval.
- Founder System Health reports cache availability and current in-process cache stats.

Required next:

- Add a distributed cache adapter before multi-instance production deployment.
- Add explicit cache invalidation to the full credential amendment/revocation implementation when those placeholder routes become real writes.
- Keep secret-bearing payloads, API secrets, unconsented student record data, and share-token verification bodies out of cache.
- Add cache-hit/cache-miss metrics when external monitoring is connected.

### 10. Error Observability

Implemented foundation:

- Structured JSON request logs from the gateway audit interceptor.
- Request IDs returned through `x-request-id` and written into logs/audit events.
- Redaction rules for passwords, secrets, tokens, authorization material, credentials, private keys, NIN, and BVN fields.
- HTTP failure capture through `ErrorObservabilityService` with durable `error.observed` audit events.
- Worker failure capture through `ErrorObservabilityService` with durable `worker.error` audit events and retry context.

Required next:

- Webhook failure dashboards.
- Error alert thresholds.
- External log sink/monitoring adapter for production alerts.

## Engineering Rules

- Heavy operations must run in background workers:
  - bulk student uploads
  - result validation
  - credential generation
  - PDF generation
  - SMS/email sending
  - webhook retries
  - analytics aggregation
- HTTP requests must return quickly with a job ID for long-running work.
- Webhook delivery must support signed payloads, retry queue, exponential backoff, dead-letter handling, delivery logs, and idempotency keys.
- Every governance-sensitive action must write immutable audit logs.
- Product teams must not create shadow queue, audit, webhook, or identity tables outside the Data Center foundation.

## Near-Term Engineer 1 Build Order

1. Dedicated worker heartbeat table if worker pool scale requires it.
2. Rate-limit bucket cleanup job and Founder Console controls.
3. Idempotency enforcement for payments, credential generation, PDF generation, and public/gateway requests.
4. Distributed cache adapter before multi-instance production deployment.
5. Webhook receiver documentation for partners.
