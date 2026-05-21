# AcadID Database Contracts

Status: Active  
Owner: Core Platform Team  
Last updated: 2026-05-21

## Database Ownership

Supabase PostgreSQL is the active development and pilot database. Prisma schema and migrations are owned by the Core Platform Team.

Product teams must not connect directly to Supabase, Prisma, or private tables for product behavior. Product workstreams consume the Data Center API.

## Core Entities

Current core models include:

- `Learner`
- `Institution`
- `User`
- `InstitutionUser`
- `AuthorityGrant`
- `Enrolment`
- `AcademicSession`
- `AcademicStructure`
- `GradingRuleSet`
- `ResultBatch`
- `AcademicRecord`
- `AcademicStanding`
- `Credential`
- `AccessGrant`
- `VerificationEvent`
- `RecordRequest`
- `InvitationLead`
- `TransferRequest`
- `RolloverRecord`
- `SealedSessionReopenRequest`
- `ApiKey`
- `DeveloperAccessRequest`
- `WebhookEndpoint`
- `WebhookDelivery`
- `Notification`
- `BackgroundJob`
- `DomainEvent`
- `WorkerHeartbeat`
- `RateLimitBucket`
- `IdempotencyRecord`
- `RevenueLedgerEntry`
- `InstitutionSubscription`
- `AuditEvent`
- `PlatformSetting`

## Identifier Rules

- `uuid`: internal database anchor. Do not expose as public identity unless the contract explicitly states it is an opaque API reference.
- `ain`: public learner Academic Identity Number.
- `institution_id`: public institution display identifier.
- `credential_id` or credential reference: public verification/sharing reference.
- API client IDs are public identifiers; API client secrets are one-time private secrets.

## Institution Type Awareness

`Institution.type` remains the broad compatibility grouping:

- `PRIMARY`
- `SECONDARY`
- `TERTIARY`
- `EXAM_BODY`

`Institution.institutionCategory` is the exact permanent category used by product setup flows:

- `NURSERY`
- `PRIMARY`
- `SECONDARY`
- `NURSERY_PRIMARY`
- `PRIMARY_SECONDARY`
- `NURSERY_PRIMARY_SECONDARY`
- `FEDERAL_UNIVERSITY`
- `STATE_UNIVERSITY`
- `PRIVATE_UNIVERSITY`
- `POLYTECHNIC`
- `COLLEGE_OF_EDUCATION`
- `EXAM_BODY`
- `OTHER_ACCREDITED`

`InstitutionApplication.institutionCategory` captures the applying institution's exact category. Founder approval must copy it to the approved `Institution` record and set `Institution.academicTemplateCode`.

Template codes are guided starting points only. Product teams must not hardcode final academic structures from templates. Final sessions, classes, departments, courses, subjects, grading rules, and scopes must be stored through Data Center `AcademicSession`, `AcademicStructure`, and `GradingRuleSet` records.

## Migration Rules

- Additive migrations are preferred.
- Never edit applied migrations.
- Use Prisma migrations for schema changes.
- Update this document when a shared model, enum, relation, or index becomes a product dependency.
- Run `npm run db:generate` after schema changes.
- Deploy migrations with `npm run db:deploy`.
- Schema changes must include tests or smoke validation before handoff.
- Avoid destructive changes unless a rollback and data migration plan exists.

## Scale Rules

- Do not add unindexed high-volume query paths.
- Verification, audit, job, credential, record-request, and webhook lookups must stay indexed.
- Heavy analytics should aggregate asynchronously.
- Keep API requests short; use background jobs for bulk upload, validation, credential generation, PDF generation, notifications, payment confirmation, and webhook retries.
- See `docs/runbooks/production-database-scaling.md`.

## Protected Shared Infrastructure

These files require Core Platform review:

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/**`
- `apps/api/src/modules/platform/**`
- `apps/api/src/modules/auth/**`
- `apps/api/src/modules/gateway/**`
- `apps/api/src/modules/jobs/**`
- `packages/shared/src/**`
- `packages/crypto/src/**`
- Contract docs in `docs/contracts/**`
