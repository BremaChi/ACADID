# Institution Portal Team Handoff

Status: STANDBY  
Owner area: Public institution onboarding and approved institution workspace  
Dependency owner: Core Platform Team  
Last updated: 2026-05-19

## Mission

Prepare the Institution Portal product without bypassing the AcadID Data Center API. Implementation must not begin until this workstream is explicitly moved from `STANDBY` to `ACTIVE DEVELOPMENT` in `docs/WORKSTREAM_STATUS.md`.

The Institution Portal Team must not connect directly to Supabase, Prisma, object storage internals, or private database tables.

## Current Backend Status

Ready:

- Product API key flow for Institution Portal.
- MOU version endpoint.
- Upload-ticket metadata endpoint.
- Institution application submission endpoint.
- Founder Console application review, approval, rejection, request-more-info, and email-record actions.
- Founder approval creates institution workspace and one-time Registrar invite.
- Human institution staff auth foundation.
- Staff management, academic setup, grading rules, ingestion, governance, rollover, transfer, sealed-session reopen, and record request backend roots.
- Async job polling through `/api/jobs/:id`.

## Available API Endpoints

Public onboarding:

- `GET /api/portal/mou-version`
- `POST /api/portal/upload-urls`
- `POST /api/portal/institution-applications`

Approved institution workspace:

- `GET /api/portal/staff`
- `GET /api/portal/staff/scope-options`
- `POST /api/portal/staff/invite`
- `PATCH /api/portal/staff/:id`
- `POST /api/ingest/academic-sessions`
- `GET /api/ingest/academic-sessions`
- `PATCH /api/ingest/academic-sessions/:id`
- `POST /api/ingest/academic-structures`
- `GET /api/ingest/academic-structures`
- `PATCH /api/ingest/academic-structures/:id`
- `POST /api/ingest/grading-rules`
- `GET /api/ingest/grading-rules`
- `PATCH /api/ingest/grading-rules/:id`
- `POST /api/ingest/students`
- `POST /api/ingest/results`
- `POST /api/ingest/results/async`
- `POST /api/ingest/bulk-upload`
- `GET /api/ingest/batches`
- `GET /api/ingest/batches/:id`
- `GET /api/jobs/:id`
- `POST /api/govern/submit-batch`
- `POST /api/govern/review-batch`
- `POST /api/govern/approve-batch`
- `POST /api/govern/publish`
- `POST /api/govern/reject-batch`
- `POST /api/govern/amend`
- `POST /api/govern/revoke`
- `POST /api/govern/transfers`
- `GET /api/govern/transfers`
- `POST /api/govern/transfers/:id/review`
- `POST /api/govern/rollovers/preview`
- `POST /api/govern/rollovers/confirm`
- `POST /api/govern/rollovers/:id/disputes`
- `POST /api/govern/rollovers/:id/disputes/resolve`
- `POST /api/govern/sealed-sessions/:id/reopen-request`
- `POST /api/govern/sealed-sessions/:id/reopen-review`
- `GET /api/govern/record-requests`
- `POST /api/govern/record-requests/:id/review`
- `POST /api/govern/record-requests/:id/payment/confirm`
- `POST /api/govern/record-requests/:id/payment/refund`
- `POST /api/govern/record-requests/:id/fulfill`

## Auth Model

Onboarding uses an internal product API key:

- Product: Institution Portal.
- Product code: `INSTITUTION_PORTAL`.
- Required scope: `institution:apply`.
- Secret stored only in the Institution Portal backend.

Approved institution dashboard uses human institution sessions:

- Registrar, Exam Officer, Data Entry Officer, Departmental Officer, Read Only.
- Token includes institution workspace claims, permissions, and assigned scopes.
- Machine keys must not perform human-only institution actions.

Human session tokens are required for staff management, academic setup writes, and governance-sensitive institution actions.
Assigned academic scopes must be displayed and respected for non-Registrar staff.

## Institution Workspace Rules

- Institution is derived from token claims.
- Staff cannot switch institution by passing another institution ID.
- Suspended staff cannot operate.
- Registrar membership changes that require Founder approval are blocked.
- All staff updates and governance actions write audit events.

## Role Permissions

Baseline roles:

- Registrar: staff management, academic setup, ingestion, governance, publication, amendments.
- Exam Officer: academic review and record request verification.
- Data Entry Officer: student/result draft uploads.
- Departmental Officer: scoped review/upload for assigned academic structures.
- Read Only: reports and records only.

The backend remains authoritative. UI hiding is not permission enforcement.

## Academic Structure Expectations

The portal must use backend AcademicSession and AcademicStructure roots. Do not invent local class, subject, course, department, or session schemas.

Result upload screens should require the user to choose valid backend academic structures. Non-Registrar users may be blocked outside assigned scopes.

Large uploads and validation-heavy flows should use async job-producing routes, return a `jobId`, and poll `/api/jobs/:id` lightly. Retryable write requests should send `x-idempotency-key`.

## Record Request Expectations

Record request work queues must use `/api/govern/record-requests`. Fulfillment creates signed credentials and may release held payment. Refunds are available before fulfillment where permitted.

## What Not To Build While In STANDBY

- Production Institution Portal screens.
- New database tables.
- New APIs.
- New shared contracts.
- Direct Supabase reads.
- Supabase frontend SDK access to AcadID core data.
- Local copies of business logic.
- Credential signing, publication, or verification logic.

## Known Limitations

- Product deployment target is not finalized.
- Real file-storage upload provider may be dry-run in local/sandbox.
- Institution dashboard UX is not yet authorized for implementation.
- Learner-facing account flow is separate Student Product scope.

## Pending Dependencies From Core Platform

- Production deployment environment.
- Final provider configuration for file storage, email, SMS, push, and signing keys.
- Final learner auth and verifier account decisions for cross-product flows.
- Activation update in `docs/WORKSTREAM_STATUS.md`.
