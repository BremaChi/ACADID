# AcadID API Contracts

Status: Active  
Owner: Core Platform Team  
Last updated: 2026-05-19

## Purpose

This document is the shared API contract index for AcadID product workstreams. Product teams must build against the Data Center API and must not create product-local substitutes for core business rules.

Any future API, database, auth, webhook, shared state, queue, worker, or shared UI contract change must update the relevant contract document before another team depends on it.

## Gateway Doors

| Door | Route root | Primary users | Current status |
| --- | --- | --- | --- |
| Authentication | `/api/auth/*` | Founder, institution staff, product backends, institution API clients | Active |
| Admin | `/api/admin/*` | Founder Console only | Active |
| Portal | `/api/portal/*` | Institution Portal backend and institution staff sessions | Active |
| Ingestion | `/api/ingest/*` | Institution staff and approved API clients | Active |
| Governance | `/api/govern/*` | Registrar, Exam Officer, Founder Admin | Active |
| Access | `/api/access/*` | Learners and record-request flows | Partial |
| Verification | `/api/verify/*` | Employer/public verification products | Active MVP |
| Jobs | `/api/jobs/*` | Product UIs polling background work | Active |
| Webhooks | `/api/webhooks/*` | External providers such as Paystack | Active MVP |

## Available Endpoint Groups

### Auth

- `POST /api/auth/login`
- `POST /api/auth/token`
- `GET /api/auth/me`
- `GET /api/auth/mfa/setup`
- `POST /api/auth/mfa/enable`
- `GET /api/auth/mfa/recovery-codes`
- `POST /api/auth/mfa/recovery-codes/rotate`
- `POST /api/auth/user/accept-invite`
- `POST /api/auth/user/login`

See `docs/contracts/AUTH_CONTRACTS.md`.

### Institution Portal

- `GET /api/portal/mou-version`
- `POST /api/portal/upload-urls`
- `POST /api/portal/institution-applications`
- `GET /api/portal/staff`
- `GET /api/portal/staff/scope-options`
- `POST /api/portal/staff/invite`
- `PATCH /api/portal/staff/:id`

Detailed contracts remain in:

- `docs/api/institution-portal-contract.md`
- `docs/api/institution-portal-staff-contract.md`

### Academic Setup And Ingestion

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

Detailed contracts:

- `docs/api/v5-academic-setup-contract.md`
- `docs/api/grading-rules-contract.md`
- `docs/api/event-driven-jobs-contract.md`

### Governance

- `POST /api/govern/submit-batch`
- `POST /api/govern/review-batch`
- `POST /api/govern/approve-batch`
- `POST /api/govern/publish`
- `POST /api/govern/reject-batch`
- `POST /api/govern/amend`
- `POST /api/govern/revoke`
- `POST /api/govern/rollovers/preview`
- `POST /api/govern/rollovers/confirm`
- `POST /api/govern/transfers`
- `GET /api/govern/transfers`
- `POST /api/govern/transfers/:id/review`
- `POST /api/govern/rollovers/:id/disputes`
- `POST /api/govern/rollovers/:id/disputes/resolve`
- `POST /api/govern/sealed-sessions/:id/reopen-request`
- `POST /api/govern/sealed-sessions/:id/reopen-review`
- `GET /api/govern/record-requests`
- `POST /api/govern/record-requests/:id/review`
- `POST /api/govern/record-requests/:id/payment/confirm`
- `POST /api/govern/record-requests/:id/payment/refund`
- `POST /api/govern/record-requests/:id/fulfill`

Detailed contracts:

- `docs/api/record-request-fulfillment-contract.md`
- `docs/api/transfer-and-rollover-disputes-contract.md`

### Verification

- `GET /api/verify/ref/:refnum`
- `POST /api/verify/bulk`
- `GET /api/verify/ain/:ain`
- `GET /api/verify/status/:credId`
- `GET /api/verify/:token`

Detailed contract:

- `docs/api/public-verification-contract.md`

## Contract Change Rules

- Additive changes are preferred.
- Add optional fields before making fields required.
- Do not remove response fields without a migration window.
- Do not expose internal UUIDs as public identity.
- Do not return API secrets after first display.
- Long-running work must return a job ID and continue in workers.
- Gateway-sensitive actions must write audit events.
- Breaking changes require updated docs, shared schemas, tests, and a status note before handoff.

