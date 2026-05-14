# Engineer 2 Handoff: Approved Institution Dashboard

Owner: Engineer 2  
Dependency owner: Engineer 1 / Data Center API  
Status: Ready for dashboard integration  
Last updated: 2026-05-14

## Mission

Build the approved-institution dashboard on top of the AcadID Data Center API. This is the working console for Registrars, Exam Officers, Departmental Officers, Data Entry Officers, and read-only institution staff after Founder approval.

Engineer 2 must not connect directly to Supabase, Prisma, object storage internals, or private database tables. All approved-institution operations go through the Data Center API with human institution sessions or approved institution API keys where explicitly allowed.

## Product Boundary

Institution Dashboard owns:

- Institution staff UI.
- Academic setup UI.
- Learner/result upload UI.
- Upload progress and batch status UI.
- Governance work queue UI.
- Transfer, rollover, dispute, and record request screens.
- Human-friendly error handling, empty states, and mobile-safe layouts.

Data Center API owns:

- Workspace isolation.
- Staff membership and permission enforcement.
- Assigned academic scope enforcement.
- AcademicSession and AcademicStructure persistence.
- Result validation, publication, credential signing, and academic standing recompute.
- Transfer, rollover, sealed-session escalation, record request, and dispute governance.
- Audit logging, rate limiting, idempotency, queues, and worker execution.

## Authentication Model

Use human institution sessions for Registrar/dashboard users.

Human session token claims include:

- `kind: "USER"`
- `institutionUuid`
- `institutionId`
- `institutionUserId`
- `role`
- `permissions`
- `assignedScopes`

Machine/product API keys must not be used for human-only operations such as academic setup, staff management, manual rollover confirmation, transfer review, sealed-session reopen review, and record-request governance.

## Stable API Roots

### Staff Management

Use these routes for institution staff screens:

```http
GET   /api/portal/staff
GET   /api/portal/staff/scope-options
POST  /api/portal/staff/invite
PATCH /api/portal/staff/:id
```

Required permission:

```text
staff:manage
```

Security rules:

- Only human institution sessions are accepted.
- Staff results are scoped to the caller institution.
- Invite tokens and secret hashes are never returned.
- Registrar membership changes that require Founder approval are blocked.
- Every staff update writes an audit event.

### Academic Setup

Use these routes for sessions, classes, departments, subjects, courses, and grading rules:

```http
POST  /api/ingest/academic-sessions
GET   /api/ingest/academic-sessions
PATCH /api/ingest/academic-sessions/:id
POST  /api/ingest/academic-structures
GET   /api/ingest/academic-structures
PATCH /api/ingest/academic-structures/:id
POST  /api/ingest/grading-rules
GET   /api/ingest/grading-rules
PATCH /api/ingest/grading-rules/:id
```

Required permissions:

```text
academic_setup:read
academic_setup:write
```

Security rules:

- Setup writes require human sessions.
- Parent structures must belong to the same institution.
- Academic setup reads are scoped by institution membership.
- Result ingestion uses these definitions for validation and grading.

### Learner And Result Operations

Use these routes for student register uploads, result uploads, and progress screens:

```http
POST /api/ingest/students
POST /api/ingest/results
POST /api/ingest/results/async
POST /api/ingest/bulk-upload
GET  /api/ingest/batches
GET  /api/ingest/batches/:id
GET  /api/jobs/:id
```

Required permission:

```text
ingest:write
```

Operational rules:

- Large uploads should use async job-producing routes.
- The UI should show the returned `jobId`, poll `/api/jobs/:id` lightly, and never keep users waiting for heavy validation.
- Send `x-idempotency-key` on retryable upload requests.
- Data Entry and Departmental Officers are limited by assigned academic scopes.

### Governance Work Queue

Use these routes for Registrar/Exam Officer review:

```http
POST /api/govern/submit-batch
POST /api/govern/review-batch
POST /api/govern/approve-batch
POST /api/govern/publish
POST /api/govern/reject-batch
POST /api/govern/amend
POST /api/govern/revoke
```

Required permission:

```text
govern:write
```

Security rules:

- Publishing creates signed credentials and durable academic standing rollups.
- Amendments and revocations are audited.
- Governance-sensitive actions must not be simulated only in the frontend.

### Transfer And Manual Rollover

Use these routes for transfer-out and rollover screens:

```http
POST /api/govern/transfers
GET  /api/govern/transfers
POST /api/govern/transfers/:id/review
POST /api/govern/rollovers/preview
POST /api/govern/rollovers/confirm
```

Required permission:

```text
govern:write
```

Behavior:

- Transfer creation requires an approved receiving institution or a submitted destination name.
- Transfer approval marks the source enrolment `TRANSFERRED_OUT`.
- Approved transfer creates a linked `TRANSFERRED_OUT` rollover record.
- Rollover preview must not mutate enrolments.
- Rollover confirmation writes durable rollover records and next-session enrolments where applicable.

### Rollover Disputes

Use these routes for contested transfer/rollover cases:

```http
POST /api/govern/rollovers/:id/disputes
POST /api/govern/rollovers/:id/disputes/resolve
```

Behavior:

- Opening a rollover dispute creates a linked Founder-visible dispute.
- Linked transfer state moves to `DISPUTED`.
- Resolution records the note, updates the dispute, and restores the linked transfer state where appropriate.

### Sealed Session Reopen

Use these routes when an institution needs to correct a sealed session:

```http
POST /api/govern/sealed-sessions/:id/reopen-request
POST /api/govern/sealed-sessions/:id/reopen-review
```

Behavior:

- Institution users can request reopen escalation with a reason.
- Founder Admin review is required for final approval or rejection.
- Reopen requests are database-backed with one open request per sealed session and a 72-hour Founder review due date.
- The Founder Console reads the durable queue from Academic Operations; Engineer 2 should show the returned request status and due date where relevant.

### Record Requests

Use these routes for graduate/student record request operations:

```http
GET  /api/govern/record-requests
POST /api/govern/record-requests/:id/review
POST /api/govern/record-requests/:id/payment/confirm
POST /api/govern/record-requests/:id/fulfill
```

Behavior:

- Institution users see only requests for their institution.
- Fulfillment creates a signed credential and publishes it into the learner passport.
- Payment confirmation can be automated by Paystack webhook or handled by authorized governance users.
- Record request status changes must show clear notes in the UI.

## UI Expectations

Follow root `AGENTS.md` and the ACAD.ID styling system:

- Mobile-first.
- Calm navy/blue product UI.
- No school-portal visual style.
- Every screen has a title, subtitle, primary action, loading state, empty state, and error state.
- Tables must support search/filter and responsive scrolling or card layouts.

## Handoff Acceptance

Engineer 2 is ready to build once these checks pass:

- Staff management routes exist and reject machine-key access.
- Academic setup routes exist and enforce same-institution setup.
- Result upload routes include async job support and light polling.
- Governance routes cover submit, review, approve, publish, reject, amend, and revoke.
- Transfer and rollover routes cover create/list/review/preview/confirm.
- Rollover dispute routes cover create and resolve.
- Record request routes cover list/review/payment/fulfill.
- Docs state that Engineer 2 must not create shadow schemas or direct Supabase reads.
