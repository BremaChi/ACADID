# AcadID Architecture Brief v4 Memory

Source reviewed:

- `C:/Users/HP/Downloads/AcadID_Architecture_Brief_v4_Updated.docx`
- Document title: `ACADID Academic Identity Platform - System Architecture Brief`
- Version line in document: `Version 4.0 - Updated April 2026 - Institution Workspace + Graduate Record Request Model`
- Reviewed on: `2026-05-01`

## Active Source Of Truth

The v4 brief replaces the v3/v3.1 planning model for Engineer 1 work. It keeps the four-layer architecture, Supabase/PostgreSQL active database path, gateway boundary, AIN strategy, and W3C-ready credential direction, but adds mandatory institution workspace isolation, human institution authentication, and graduate RecordRequest workflows before AcadID scales institution onboarding.

Engineer 1 remains responsible for:

- Data Center API.
- Founder Console.
- Internal Operations foundation where needed.
- Gateway auth and scoping contracts used by Engineers 2, 3, and 4.

## Non-Negotiable v4 Corrections

- Normal institution dashboard actions must be performed by human InstitutionUser sessions, not by a hidden shared product API key.
- Product API keys remain for product backends, partner integrations, exam bodies, and optional institution Developer Tools.
- Every institution-scoped query must filter by `institution_id` derived from the verified token/session, not from request body input.
- Every institution action must be auditable to a human user, role, institution, endpoint, action, and outcome.
- Supabase PostgreSQL is the active development/staging database. Docker PostgreSQL is optional fallback only.
- Files must live in object storage, not PostgreSQL.
- Bulk uploads, SMS, email, credential generation, and PDF generation should move to background queues as the platform scales.
- Large tables should be designed so they can later be partitioned by year or institution.

## Four Layers

- Layer 0: Core Data Center. Permanent source of truth in Supabase PostgreSQL. Stores identity, records, credentials, grants, requests, audit logs, signing metadata, and payment references.
- Layer 1: Gateway. Single controlled boundary for auth, RBAC, scoping, rate limits, audit logs, and product/partner access.
- Layer 2: Products. Student app, Institution Portal, Employer Portal, Founder Console, and Operations Panel. Products never touch the database directly.
- Layer 3: External Partners. WAEC, NECO, JAMB, NYSC, HR systems, professional bodies, and other scoped integrations.

## Deployment Map

- `api.acadid.ng`: Data Center API, connects to Supabase PostgreSQL.
- `console.acadid.ng`: Founder Console, uses founder human super-admin session.
- `ops.acadid.ng`: Internal Operations Panel, uses internal human staff sessions.
- `portal.acadid.ng`: Institution Portal, uses product key plus human institution sessions.
- Student mobile apps: use product key plus learner sessions.
- `verify.acadid.ng`: Employer Portal, uses product key plus company user sessions.
- Exam body integration: uses partner API key.

Required runtime environment variables:

- `DATABASE_URL`: Runtime connection to Supabase PostgreSQL, usually pooler route.
- `DIRECT_URL`: Prisma migration connection.
- `SEED_SUPER_ADMIN_EMAIL`: Seed-only founder login email.
- `SEED_SUPER_ADMIN_PASSWORD`: Seed-only founder password. Do not expose; rotate after first login.

## Authentication Model

AcadID now has two authentication systems:

- Machine-to-machine API key auth: `client_id` + `client_secret`, exchanged through `POST /auth/token`. Token carries client id, scopes, environment, product or institution context, and expiry.
- Human user auth: email + password + optional/required 2FA. Token carries `user_id`, `institution_id` or other owner id, role, permissions, `session_id`, and expiry.

Human auth endpoints required by v4:

- `POST /auth/user/login`
- `POST /auth/user/invite`
- `POST /auth/user/accept-invite`
- `POST /auth/user/reset-password`
- `GET /auth/user/me`
- `POST /auth/user/logout`

API key endpoints required by v4:

- `POST /auth/token`
- `POST /founder/api-keys`
- `POST /institutions/:id/developer-keys`
- `POST /api-keys/:id/revoke`

Current repo note:

- Founder login and machine API key auth exist.
- Institution staff human sessions now exist through `/auth/user/*`.
- `InstitutionUser` has been expanded into an invited/active staff account model with status, permissions, invite token lifecycle, last-login tracking, and institution-scoped login claims.

## Institution Workspace Isolation

Founder approval must create an isolated institution workspace:

- Institution record with public `institution_id`.
- AuthorityGrant/MOU record.
- Registrar InstitutionUser in invited state.
- Secure invite link.
- Optional signing key setup.
- Public directory status.
- Audit event.

Current repo note:

- Founder approval now creates the institution workspace and one-time Registrar invite token.
- `AuthorityService` now enforces active institution workspace membership before human institution users can operate on institution data.
- `AuthorityService` exposes workspace-scoped query helpers so future services do not hand-roll institution filters.
- `ScopesGuard` now enforces human permissions as well as API-key scopes.

Roles:

- Registrar: publish results, approve amendments, manage staff, sign/renew MOU, activate Developer Tools, approve graduate record requests.
- Exam Officer: review submitted batches, approve to registrar queue, reject/request correction, view register and batch history.
- Data Entry Officer: upload students, enter results, save drafts, submit batches, process assigned archive uploads if permitted.
- Read Only: view permitted records/reports only.

Founder boundary:

- Founder approves institutions and controls platform-level risk.
- Founder must not operate as the hidden actor behind normal school activity.
- Founder must not manage every school staff password or publish school results for them.

## Ten Core Entities

v4 expands the core model from 8 to 10 entities:

1. Learner: permanent human identity from nursery to PhD.
2. Institution: verified educational body or exam body.
3. InstitutionUser: human staff account inside an institution workspace.
4. Enrolment: relationship between Learner and Institution over time.
5. AcademicRecord: raw immutable academic data.
6. Credential: signed, packaged, shareable version of records.
7. VerificationEvent: append-only log of credential checks.
8. AccessGrant: student-controlled permission/share link.
9. AuthorityGrant: legal/MOU record authorizing publication.
10. RecordRequest: graduate/student request to locate, verify, upload, or publish old records.

RecordRequest required fields include:

- `uuid`
- `request_id` such as `REQ-YYYY-XXXXXX`
- `learner_id`
- `institution_id`, nullable for unregistered institutions
- `institution_name_submitted`
- `education_level`
- `years_attended_from`
- `years_attended_to`
- `student_number`
- `department_or_class`
- `record_types_requested`
- `proof_document_urls`

Additional RecordRequest implementation should include status, payment/escrow fields, deadline/overdue tracking, assignment, notes, rejection/dispute/escalation fields, audit references, and indexes.

## Gateway Doors

- `/ingest`: student registers, bulk uploads, result batches, archive uploads, exam body pushes. Add `/record-requests/:id/upload`.
- `/govern`: submit, review, approve, publish, reject, amend, revoke, and record request approval. Institution actions require human institution session.
- `/access`: learner passports, results, credentials, share links, verification logs, and record request creation/status.
- `/verify`: third-party checks by token, reference, AIN, QR, or bulk verification.

Audit event minimum fields:

- `request_id`
- `actor_type`
- `actor_user_id`
- `client_id`
- `institution_id`
- `role`
- `endpoint`
- `action`
- `entity_type`
- `entity_id`
- `outcome`
- `ip_address`
- `user_agent`
- `timestamp`

No audit event may be deleted.

## Product Updates

Student Mobile App:

- Academic passport and AIN claiming.
- Result and credential viewing.
- Share links with scope, expiry, revocation.
- QR verification.
- Verification log.
- Graduate Record Request creation/status.
- Disputes.
- Transfer.
- Identity anchor linking.
- NDPA export.

Institution Portal:

- Public registration.
- Human staff login.
- Students, Results, Record Requests, Staff, Credentials, Transfers, Disputes, Developer Tools, Settings.
- Record Requests queue statuses: Pending, In Review, Needs More Info, Overdue, Completed, Rejected, Disputed.
- Mandatory verification checklist before archive upload.

Employer Verification Portal:

- Verify by share link, reference number, AIN, or QR.
- Bulk verification CSV.
- Certified PDF report.
- Company accounts, billing, verification history.
- High-volume API access after approval.

Exam Body Ingest API:

- WAEC/NECO/JAMB/NYSC machine-to-machine ingest.
- Dedicated partner API keys after bilateral agreement.
- Matching by name, DOB, school code, exam number where available.
- Confidence scoring and manual review queues.

Live Results API:

- Optional Developer Tools feature inside institution dashboard.
- Registrar activates and accepts terms.
- Scoped institution developer key is shown once.
- Key supports only that institution and still passes governance before publication.
- Institution can revoke/regenerate without founder involvement after approval.

Internal Operations Panel:

- Institution onboarding/document review.
- MOU version management.
- Record Request escalation/refund supervision.
- Dispute and fraud incident management.
- Audit search.
- Compliance tools.
- SMS campaigns and unclaimed passport management.

Founder Console:

- Platform dashboard, revenue snapshot, health strip, audit feed, pending approvals, open disputes, overdue record requests.
- Institution management with workspace, AuthorityGrant, registrar, staff summary, documents, activity, disputes.
- Approval creates workspace, AuthorityGrant, Registrar InstitutionUser invite, public directory entry, and audit event.
- API key management only for engineer keys, exam body keys, product keys, emergency revocation, and approved partner cases.
- Invitation leads for unregistered institutions requested by graduates.
- Record Request intelligence: total requests, escrow, overdue institutions, completion rate, rejection/dispute rate.
- Webhook oversight.
- Business intelligence.
- Founder Security with email/password/TOTP, idle timeout, emergency lockdown, full audit.

## Graduate Record Request Flow

This flow lets graduates request old academic records from primary, secondary, university, polytechnic, or college.

If the institution is registered:

- Student app creates RecordRequest.
- Fee is calculated by record type and institution type.
- Payment is held in escrow.
- Institution verifies archive, uploads record, registrar approves.
- Record is published to passport.
- Payment is released by split rules.

If the institution is not registered:

- Graduate may submit interest/request.
- No payment is taken yet.
- Founder Console groups requests by `institution_name_submitted`.
- Founder sees demand count, potential revenue, and outreach status.
- When the institution joins, held requests transfer into its queue.
- Graduate is notified to confirm/payment before processing.

RecordRequest statuses:

- `SUBMITTED`
- `RECEIVED`
- `VERIFYING`
- `NEEDS_MORE_INFO`
- `VERIFIED`
- `UPLOADING`
- `PENDING_APPROVAL`
- `PUBLISHED`
- `REJECTED`
- `DISPUTED`
- `ESCALATED`

AIN can be created through:

- Institution upload.
- Student self-registration.
- Institution QR code.
- Graduate Record Request.
- Exam body match.

## Result Lifecycle

No skipping statuses:

- `DRAFT`
- `SUBMITTED`
- `REVIEWED`
- `APPROVED`
- `PUBLISHED`
- `AMENDED`

Published records are immutable. Amendments require original value, corrected value, reason, registrar confirmation, new version, and audit event with actor user id.

## Governance, Compliance, And Monetization

Governance principles:

- Least privilege.
- Immutability.
- Human accountability.
- Student control.
- No individual data sale.
- NDPA 2023 workflows.
- W3C VC credential portability.

Revenue streams:

- Institution onboarding/setup.
- Employer verification.
- Graduate record requests.
- International credential packaging.
- Institution subscriptions.
- Professional body verification.

Suggested record request fees:

- Primary/secondary result slip: NGN 3,000.
- Secondary transcript: NGN 5,000.
- University transcript: NGN 15,000.
- Certificate attestation: NGN 20,000.
- International packaging add-on: NGN 25,000.
- Express processing surcharge: NGN 10,000.

## v4 Phased Roadmap

- Phase 0, weeks 1-12: Data Center API, Founder Console, human auth, API key auth, workspace isolation, 10 entities, gateway doors, sandbox, Supabase deployment.
- Phase 1, weeks 13-22: Institution Portal MVP with registration, login, staff roles, student upload, result upload, approval workflow, record request queue.
- Phase 2, weeks 23-34: Student Mobile App with passport claiming, record requests, results, sharing, verification logs, disputes, transfer.
- Phase 3, months 9-16: Employer portal, billing, WAEC/NECO/JAMB integrations, certified PDF reports, W3C VC exports.
- Phase 4, year 2+: Live Results API, SDKs, webhooks, professional body integrations, NYSC, government MOUs.

## Engineer 1 Update / Remove Checklist

Stop doing:

- Treating Docker PostgreSQL as required.
- Treating Engineer 2 product key as the identity for normal institution staff actions.
- Generating keys for normal institutions or staff from Founder Console.
- Only flipping institution status during approval.
- Stopping at 8 entities.
- Making founder the operator for every school.
- Logging only `client_id`.
- Treating school upload request as only a student app note.

Add/update:

- Supabase env-driven database workflow.
- Human session JWT for staff actions.
- Audit actor user id and role.
- Workspace, AuthorityGrant, Registrar InstitutionUser, invite email, public directory status on approval.
- InstitutionUser and RecordRequest migrations, indexes, enums.
- Founder workspace view, registrar invite status, demand leads, record request intelligence.
- Full RecordRequest entity, status lifecycle, queues, payment fields, escalation logic.

## Engineer 1 Build Sequence

1. Database and migrations: add/expand 10 entities, role/status/payment enums, and indexes on institution id, learner id, request id, AIN, status, created at, token.
2. Auth systems: keep machine API key auth; add human auth endpoints; JWT includes user id, role, permissions, institution id where applicable.
3. Workspace isolation middleware: derive institution id from token/session and inject service-layer filters.
4. Audit logger upgrade: capture actor type, user id, client id, institution id, role, endpoint, action, entity, outcome, IP/user-agent, request id.
5. Institution approval workflow: create workspace, AuthorityGrant, Registrar InstitutionUser invite, optional signing key, approval email.
6. RecordRequest API: student creation/status, institution queue/read/update, founder/ops escalation, payment status hooks.
7. Gateway doors: update `/ingest`, `/govern`, `/access`, `/verify` for human sessions and RecordRequest flows.
8. Founder Console updates: workspace details, registrar invite status, request demand, invitation leads, API key boundaries, overdue/escalation dashboards.
9. Supabase deployment alignment.
10. Engineer 2 handoff: product key, auth docs, permission matrix, JWT examples, RecordRequest endpoint docs, sandbox test accounts.

## Handoff Checklist For Engineer 2

Engineer 2 should receive:

- Product key.
- Auth endpoint docs.
- Role permission matrix.
- Example JWT payloads.
- RecordRequest endpoint docs.
- Sandbox test accounts.

Critical acceptance behaviours:

- `POST /auth/user/login` returns institution staff JWT with institution id and role.
- `GET /auth/user/me` returns profile, permissions, and institution scope.
- `POST /auth/user/invite` lets registrar invite staff.
- `POST /ingest/students/bulk` returns match/create summary.
- `POST /ingest/results/bulk` creates draft batch with validation summary.
- `POST /govern/submit` submits batch to Exam Officer.
- `POST /govern/review` lets Exam Officer approve/reject with reason.
- `POST /govern/publish` lets Registrar publish and create credential.
- `POST /access/record-requests` lets student app create request.
- `GET /institutions/me/record-requests` shows only own institution requests.
- `POST /record-requests/:id/approve` lets Registrar publish archive record to passport.

## Current Repo Gap Against v4

Already present:

- Supabase PostgreSQL active workflow.
- Machine API key auth.
- Founder login and TOTP/recovery-code foundation.
- v4 institution staff invitation foundation: expanded InstitutionUser fields, staff invite token, invite acceptance, human `/auth/user/*` endpoints, and institution-scoped login claims.
- Founder approval creates the institution workspace and a one-time Registrar invite token for sandbox delivery.
- Founder Console overview, applications, API keys, disputes, verification logs, revenue, health, settings, and security foundations.
- AuthorityGrant, Institution, Learner, Enrolment, AcademicRecord, Credential, AccessGrant, VerificationEvent, AuditEvent.

Still needed:

- Add `RecordRequest` model, enums, indexes, and payment/escrow lifecycle.
- Add strict workspace isolation utilities for every institution-scoped service.
- Upgrade AuditEvent schema and writer to capture v4 minimum fields.
- Add record request queues and intelligence to Founder Console.
- Update Engineer 2 handoff docs to v4 human-session model.
