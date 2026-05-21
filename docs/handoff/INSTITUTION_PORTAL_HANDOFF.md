# Institution Portal Team Handoff

Status: ACTIVE DEVELOPMENT
Owner area: Public institution onboarding and approved institution workspace
Dependency owner: Core Platform Team
Last updated: 2026-05-21

## Mission

Build the Institution Portal product without bypassing the AcadID Data Center API. This workstream is now activated for Institution Portal implementation under the scope recorded in `docs/WORKSTREAM_STATUS.md`.

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

Institution application submissions must include `institutionCategory`. Supported categories are documented in `docs/contracts/API_CONTRACTS.md` and `docs/design/INSTITUTION_PORTAL_TYPE_AWARE_BRIEF.md`.

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
- Environment for current build: `SANDBOX`.
- Required scope: `institution:apply`.
- The Founder has generated the Sandbox Institution Portal product API credentials and stored them in a secure founder-controlled document.
- Secret stored only in the Institution Portal backend.
- Never commit `client_id`, `client_secret`, access tokens, or the secure document link.
- Never expose `client_secret` to browser JavaScript.

Institution Portal backend environment variables should use a shape like:

```env
ACADID_API_BASE_URL=http://localhost:4000/api
ACADID_CLIENT_ID=founder-provided-sandbox-client-id
ACADID_CLIENT_SECRET=founder-provided-sandbox-client-secret
```

The portal backend exchanges those credentials through:

```http
POST /api/auth/token
```

Use the returned access token server-side when calling onboarding endpoints. Do not call `/api/auth/token` from client-side UI code.

Approved institution workspace dashboards use human institution sessions:

- Registrar, Exam Officer, Data Entry Officer, Scoped Academic Officer, Read Only.
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

Baseline roles and role-focused dashboard expectations:

- Registrar: full institution control workspace for staff management, academic setup, ingestion oversight, governance, publication, amendments, record requests, and developer access where permitted.
- Exam Officer: review workspace for batch validation, academic review, corrections, record request verification, and publication handoff actions allowed by permission.
- Data Entry Officer: upload workspace for student register uploads, result draft entry, bulk upload jobs, validation errors, and resubmission.
- Scoped Academic Officer: limited workspace for assigned academic scopes only. This replaces the product-facing "Departmental Officer" mindset and must adapt to the institution category.
- Read Only: reporting workspace for permitted records, reports, verification history, and audit-safe viewing only.

The backend remains authoritative. UI hiding is not permission enforcement.

## Role-Focused Dashboard UX

There is one approved Institution Portal shell, but staff should not all see the same dashboard.

The portal must use the authenticated user's `role`, `permissions`, `assignedScopes`, institution `status`, and `institutionCategory` to choose the landing dashboard, navigation, empty states, primary actions, and detail panels.

Do not put all institution operations on every worker's home screen. Each staff workspace should surface only the work that role can reasonably do:

- Registrar sees institution setup health, pending approvals, staff, publishing, amendments, record requests, and developer controls.
- Exam Officer sees review queues, validation status, academic exceptions, record request verification, and publication handoff.
- Data Entry Officer sees upload actions, draft batches, import errors, job progress, and resubmission tasks.
- Scoped Academic Officer sees only assigned classes, subjects, departments, programmes, courses, exam series, or other academic scopes.
- Read Only sees reports and records without mutation actions.

Role-focused dashboards are a UI/UX responsibility. The API remains permission-based and does not prescribe card layout, colors, or navigation order.

## Scoped Academic Officer Labels

Use "Scoped Academic Officer" in contracts. The product UI may display a friendlier label based on `institutionCategory` and `assignedScopes`:

- Nursery/Primary: Class Teacher, Class Officer, or Academic Officer.
- Secondary/combined schools: Subject Officer, Class/Form Officer, HOD, or Scoped Academic Officer.
- Universities: Departmental Officer, Programme Officer, Course Officer, or Faculty Officer.
- Polytechnics: Department Officer, Programme Officer, ND/HND Level Officer, or Course Officer.
- Colleges of Education: Department Officer, NCE Programme Officer, or Course Officer.
- Exam Bodies: Exam Series Officer, Paper Officer, or Result Officer.
- Other Accredited: Scoped Academic Officer until the institution's structure is configured.

These are display labels only. Permission enforcement must use backend `role`, `permissions`, and `assignedScopes`.

## Academic Structure Expectations

The portal must use backend AcademicSession and AcademicStructure roots. Do not invent local class, subject, course, department, or session schemas.

Result upload screens should require the user to choose valid backend academic structures. Non-Registrar users may be blocked outside assigned scopes.

Large uploads and validation-heavy flows should use async job-producing routes, return a `jobId`, and poll `/api/jobs/:id` lightly. Retryable write requests should send `x-idempotency-key`.

## Institution Type Awareness

There is one Institution Portal, not separate apps for each school type. The portal must branch onboarding and setup guidance by `institutionCategory`:

- Nursery and primary categories use terms, levels/classes, arms, and subjects.
- Secondary categories use JSS/SSS levels, terms, arms, and subjects.
- University categories use semesters, faculties, departments, programmes, levels, courses, and credit units.
- Polytechnic uses semesters, schools/faculties, departments, programmes, ND/HND levels, courses, and credit units.
- College of Education uses semesters, schools, departments, NCE levels, courses, and credit units.
- Exam Body uses exam series, candidates, subjects/papers, and result release flows.
- Other Accredited starts from a custom setup path.

`Institution.type` is only the broad backend grouping. Do not use it to decide detailed UI flows. Use `institutionCategory` and the returned academic template guidance, then persist the final institution structure through Data Center APIs.

## Record Request Expectations

Record request work queues must use `/api/govern/record-requests`. Fulfillment creates signed credentials and may release held payment. Refunds are available before fulfillment where permitted.

## What Not To Build In This Phase

- New database tables.
- New APIs.
- New shared contracts.
- Direct Supabase reads.
- Supabase frontend SDK access to AcadID core data.
- Local copies of business logic.
- Credential signing, publication, or verification logic.
- Production API key integration. Production credentials are generated only after the portal is tested and release-approved.

## Known Limitations

- Product deployment target is not finalized.
- Real file-storage upload provider may be dry-run in local/sandbox.
- Learner-facing account flow is separate Student Product scope.

## Pending Dependencies From Core Platform

- Production deployment environment.
- Final provider configuration for file storage, email, SMS, push, and signing keys.
- Final learner auth and verifier account decisions for cross-product flows.
- Production Institution Portal credentials and deployment environment.
