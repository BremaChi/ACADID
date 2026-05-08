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

Required next:

- Per-institution webhook secrets.
- Founder Console retry/replay controls.
- Webhook receiver documentation for partners.

### 3. Retry Policies

Implemented foundation:

- Worker retry/failure handling.
- Retry status and run-after scheduling.
- Non-retryable errors for malformed imports.
- Exponential backoff for worker retry scheduling.
- Webhook dead-letter state after exhausted attempts.

Required next:

- Central retry policy module by job type.
- Retry jitter.
- Dedicated dead-letter queue/listing for operator review.
- Operator retry controls in Founder Console.

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

Required next:

- Persistent distributed rate limiting for:
  - auth endpoints
  - verification APIs
  - upload endpoints
  - public search endpoints
- Per-institution and per-product limits.
- Founder Console controls for default and emergency rate limits.

### 9. Caching Strategy

Current state:

- No centralized caching layer yet.

Required next:

- Cache read-heavy public verification status safely.
- Cache institution metadata and platform settings with short TTLs.
- Never cache secret-bearing payloads or unconsented student record data.
- Add cache invalidation on credential revocation, amendment, institution suspension, and API key revocation.

### 10. Error Observability

Current state:

- Structured errors exist at API boundaries, but centralized error observability is not implemented.

Required next:

- Structured JSON logs.
- Request/job correlation IDs.
- Worker error capture.
- Webhook failure dashboards.
- Error alert thresholds.
- Redaction rules for student data, credentials, secrets, and tokens.

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

1. Persistent rate limiting for auth, verification, uploads, and public search.
2. Structured logging and error-observability baseline.
3. Caching strategy for safe read-heavy surfaces.
4. Per-institution webhook secrets and Founder Console replay controls.
5. Dedicated worker heartbeat table if worker pool scale requires it.
