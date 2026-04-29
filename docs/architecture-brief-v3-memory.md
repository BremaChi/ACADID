# AcadID Architecture Brief v3 / v3.1 Memory

Source reviewed:

- `C:/Users/HP/Downloads/AcadID_Architecture_Brief_v3.docx`
- Document title: `ACADID Academic Identity Platform - System Architecture Brief`
- Version line in document: `Version 2.0 - Updated April 2026 - Includes Option B Deployment Architecture`
- `C:/Users/HP/Downloads/ACADID_Full_Updated_Architecture_v2_1.docx`
- Document title: `ACADID System Architecture Brief v3.1 (Updated MVP Model)`
- Reviewed on: `2026-04-29`

## Core Direction

AcadID is now framed as an Option B standalone API platform:

- `api.acadid.ng`: Data Center API, standalone service, owns the database.
- `console.acadid.ng`: Founder Console, built with the Data Center API in Phase 0.
- Other products are separate clients and must never connect directly to the database.
- Every product and partner connects only through API keys and gateway endpoints.

The engineering scope for the current build is Engineer 1:

- Build the Data Center API.
- Build the Founder Console.
- Generate and manage API keys for internal AcadID products.
- Keep the database private behind the gateway.

## v3.1 MVP Update

The v3.1 brief keeps the four-layer architecture, eight core entities, gateway model, AIN system, verification system, credential model, governance, and transfer logic.

The key change is the MVP API access and institution onboarding model:

- Founder generates API keys only for internal AcadID products at MVP stage.
- The MVP product API keys are for the Institution Portal, Student Mobile App, Employer Verification Portal, and future External Exam Bodies.
- Institutions do not receive API keys during normal onboarding.
- Institutions register through the public Institution Portal at `portal.acadid.ng`.
- Founder approves or rejects institution applications from the Founder Console.
- Approved institutions become AcadID Partners and receive login access to their dashboard.
- Institution-level API access is optional and disabled by default.
- Institutions can later request API access for Live Results / live score entry.
- Founder must approve institution API access before the institution can generate its own key.

## Permanent Architecture Rules

- Four layers remain: Core Data Center, Gateway, Products, External Ecosystem.
- Eight core entities remain: Learner, Institution, Enrolment, Academic Record, Credential, Verification Event, Access Grant, Authority Grant.
- Founder Console is now Product 7 and is Phase 0 infrastructure, not a later admin extra.
- No product may bypass the gateway or access the database directly.
- API secrets are shown once, stored only as hashes, and revoked/regenerated if lost.
- MVP API secrets belong to internal products first, not directly to institutions during onboarding.
- W3C VC 2.0 credential payload support remains required.
- Published records must be immutable; amendments create signed new versions.
- Audit events must be append-only.
- Nigeria data residency, least privilege, student ownership, and no individual data monetisation remain product commitments.

## Founder Console Scope

The Founder Console must include these sections:

- Platform overview dashboard.
- Institution management.
- API key generation.
- Global API key management.
- Webhook management.
- Dispute queue.
- Business intelligence.
- Founder account and security.

The v3.1 Founder Console must also support institution applications:

- View submitted institution registration details.
- View uploaded documents.
- View signed MOU.
- Approve or reject applications.
- Activate institution login access after approval.
- Manage product-level API keys for internal AcadID products.
- Manage optional institution-level API access requests after onboarding.

The most important unblocking workflow is API key generation for AcadID internal products and later engineers:

- Founder selects product/client context, such as Institution Portal, Student App, Verification Portal, or Exam Body integration.
- Founder selects scopes and rate limit.
- System generates `client_id` and `client_secret`.
- Secret is displayed once.
- Product engineer exchanges credentials for a bearer token with `POST /auth/token`.

Institution-level API key generation is no longer the default onboarding path. It is a locked optional feature behind "Request API Access" and founder approval.

## Institution Portal Scope

The public Institution Portal is a separate product at `portal.acadid.ng`.

Landing page sections:

- What is AcadID.
- Benefits for institutions.
- How it works.
- Supported institution types.
- Future testimonials.
- CTA: Register Your Institution.

Supported institution types:

- Nursery.
- Primary School.
- Secondary School (JSS / SSS).
- Combined School.
- Polytechnic.
- College of Education.
- University.
- Exam Body with special onboarding.

Registration flow:

- Institution submits name, type, state, address, contact person, email, and student volume.
- Institution uploads required documents.
- Institution reviews policy and signs MOU digitally.
- Application enters `PENDING` status.
- Founder approves or rejects from the Founder Console.

Approved Institution Dashboard sections:

- Overview.
- Students.
- Results with three-tier workflow: Submit, Review, Publish.
- Staff and role assignment.
- Credentials and verification logs.
- Locked Developer Tools for Live Results API.
- Settings, profile, MOU, and notifications.

## Phase 0 Handoff Target

Engineer 2 is unblocked only when these are working in sandbox:

- `POST /auth/token` returns JWT for an internal product key, starting with the Institution Portal product key.
- `POST /ingest/students` creates Learner and returns AIN.
- `POST /ingest/results` creates AcademicRecord in DRAFT.
- `POST /govern/submit` moves status to SUBMITTED.
- `POST /govern/approve` moves status through the review/approval chain.
- `POST /govern/publish` creates signed Credential.
- `GET /access/passport` returns the student's full record.
- `GET /verify/:token` returns verification outcome.
- Founder Console can generate a new product-level API key.
- Founder Console can enable authenticator-code security for the founder account.
- A test institution can register through the Institution Portal model, receive Founder approval, and move from onboarding through published credential.

## Current Implementation Checkpoint

Already built and verified:

- Supabase PostgreSQL is the active development database.
- Prisma schema uses `DATABASE_URL` and `DIRECT_URL`.
- API health route works.
- Founder email/password login works.
- Institution creation works.
- Authority Grant creation works.
- Learner ingestion works.
- Result ingestion, governance transitions, publishing, signed credential creation, and credential reference verification work.
- API key generation, one-time `client_secret` display, safe key listing, revocation endpoint, and `POST /auth/token` are implemented.
- Scoped API-key tokens can perform institution ingestion and governance for their assigned institution in the current implementation.
- Basic per-key rate limiting is enforced from token metadata.
- Founder Console now connects to the live API for login, institution creation/listing, Authority Grant creation, API key generation, one-time secret display, key listing, and key revocation.
- Founder TOTP setup and login enforcement are implemented, with encrypted TOTP secret storage.
- Global API key management is implemented with institution context, search/filter UI, and safe listings that never expose secret hashes.
- `npm run smoke:api` verifies the live Supabase-backed API flow.
- Web app runs at `http://localhost:3000`.
- API runs at `http://localhost:4000`.

Important gaps against v3:

- Reclassify the current API key model so MVP keys are product-level first, with institution-level keys locked behind a later Request API Access flow.
- Add public Institution Portal registration, document upload metadata, digital MOU acceptance/signature, and founder approval/rejection workflow.
- Add approved institution dashboard sections: Students, Results, Staff, Credentials, locked Developer Tools, and Settings.
- Expand webhook management, dispute queue, BI, and founder security pages.
- Add production-grade founder MFA recovery policy and admin break-glass controls.
- Add keystore table and stable institution signing-key management.
- Add append-only audit hardening and published-record immutability enforcement at database level.
- Add AIN sequence table and manual-review path for medium-confidence identity matches.
- Align route names with v3 API contract where needed while preserving existing working routes during migration.

## Next Build Step

Next engineering move:

1. Align the data model and API key ownership model with v3.1 product-level MVP keys.
2. Add Institution Portal registration and Founder approval workflow.
3. Add database-backed automated workflow tests.
4. Add webhook registration and delivery log models.
5. Add production signing-key management.
