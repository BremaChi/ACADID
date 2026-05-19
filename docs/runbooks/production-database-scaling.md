# Production Database Scaling

AcadID is national-scale academic identity infrastructure. The database plan must keep the Core Data Center reliable while product apps grow independently.

## Current Active Setup

- Supabase PostgreSQL is the active cloud database.
- The backend API owns all reads/writes through Prisma and gateway services.
- Product apps must not read or write Supabase tables directly.
- `DATABASE_URL` is runtime traffic.
- `DIRECT_URL` is migration/administration traffic.

## Scale Targets

Engineer 1 should assume:

- millions of learners,
- millions of verification events,
- high-volume institution staff activity,
- bursty uploads at term/session deadlines,
- public verification traffic from employers and partners,
- many background workers operating at the same time.

## Added High-Volume Indexes

Migration:

```text
packages/database/prisma/migrations/20260519000000_production_scale_indexes/migration.sql
```

Index groups:

- `VerificationEvent`: public verification logs, suspicious IP review, share-link access review.
- `Credential`: learner passport, institution credential lists, issuer/type/status dashboards.
- `AuditEvent`: founder/security review by action, outcome, actor role, IP hash, target.
- `BackgroundJob`: ready queue leasing, stale running jobs, completed/failed retention scans.
- `DomainEvent`: pending event publishing and published-event retention.
- `ApiKey`: active/expired key review and usage recency.
- `RecordRequest`: payment/escrow review and deadline monitoring.
- `RevenueLedgerEntry`: source lookup and reconciliation.

## Retention Policy

Do not delete legally sensitive records casually. Retention must be policy-driven and auditable.

Recommended defaults for pilot:

- `AuditEvent`: retain online for 7 years.
- `VerificationEvent`: retain online for 3 years, then archive aggregates and cold export where contracts allow.
- `BackgroundJob`: retain successful jobs for 90 days, failed jobs for 1 year.
- `DomainEvent`: retain published events for 1 year.
- `WebhookDelivery`: retain delivered rows for 1 year, failed rows for 3 years.
- `Notification`: retain sent delivery metadata for 1 year, failed rows for 3 years.
- `RateLimitBucket`: existing cleanup job handles short-lived buckets.
- `IdempotencyRecord`: existing cleanup job handles expired records.

Before deletion, export retention candidates to controlled storage if required by MOU, dispute, finance, or legal hold.

## Partitioning Roadmap

Do not partition small pilot tables too early. Partition only after real growth confirms the pressure.

First partition candidates:

- `VerificationEvent` by `verifiedAt` monthly.
- `AuditEvent` by `createdAt` monthly.
- `BackgroundJob` by `createdAt` monthly after worker volume grows.
- `DomainEvent` by `createdAt` monthly after event publishing grows.
- `WebhookDelivery` by `createdAt` monthly after partner integrations grow.

Partition rules:

- Keep current logical table names stable for Prisma and app code.
- Introduce partitions through DBA-reviewed SQL migrations.
- Test every partition change against `npm test`, `npm run smoke:api`, worker startup, and Founder Console System Health.
- Ensure all foreign keys and indexes required by query plans remain available.

## Read Replica Strategy

Runtime writes must stay on the primary database.

Read replica candidates:

- Founder dashboard summaries.
- Verification log exports.
- Revenue reports.
- Audit log exports.
- Analytics aggregation.

Do not move governance writes, credential signing publication, payment confirmation, or queue leasing to replicas.

Implementation direction:

- Keep default Prisma client on `DATABASE_URL`.
- Add an explicit read-only database client only after Supabase read replica is provisioned.
- Use read replica only in service methods that are safe for stale reads.
- Never use read replica inside transactions that publish credentials, update payment state, or lease jobs.

## Query Rules

- Always paginate high-volume list endpoints.
- Prefer cursor pagination for verification/audit/revenue exports.
- Avoid unbounded `findMany`.
- Do not sort large tables on unindexed columns.
- Keep public verification responses free of internal UUIDs.
- Keep PII encrypted/hashed where already designed.

## Operational Checks

Before production launch:

- Run `EXPLAIN ANALYZE` for Founder Console heavy endpoints.
- Confirm Supabase connection pooling limits.
- Confirm backup and point-in-time recovery.
- Confirm Nigeria data residency commitments and cross-border terms.
- Confirm retention and legal hold workflows.
- Confirm alert thresholds for:
  - queue backlog,
  - verification error rate,
  - DB connection pressure,
  - slow queries,
  - failed webhook deliveries,
  - failed background jobs.

## Engineer Handoff Rule

Any product engineer needing new data must request a Data Center API root. Do not allow product teams to add direct Supabase queries to bypass the gateway.
