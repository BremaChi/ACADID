# AcadID Architecture Brief v3 Memory

Source reviewed:

- `C:/Users/HP/Downloads/AcadID_Architecture_Brief_v3.docx`
- Document title: `ACADID Academic Identity Platform - System Architecture Brief`
- Version line in document: `Version 2.0 - Updated April 2026 - Includes Option B Deployment Architecture`

## Core Direction

AcadID is now framed as an Option B standalone API platform:

- `api.acadid.ng`: Data Center API, standalone service, owns the database.
- `console.acadid.ng`: Founder Console, built with the Data Center API in Phase 0.
- Other products are separate clients and must never connect directly to the database.
- Every product and partner connects only through API keys and gateway endpoints.

The engineering scope for the current build is Engineer 1:

- Build the Data Center API.
- Build the Founder Console.
- Generate and manage API keys for later engineers/products.
- Keep the database private behind the gateway.

## Permanent Architecture Rules

- Four layers remain: Core Data Center, Gateway, Products, External Ecosystem.
- Eight core entities remain: Learner, Institution, Enrolment, Academic Record, Credential, Verification Event, Access Grant, Authority Grant.
- Founder Console is now Product 7 and is Phase 0 infrastructure, not a later admin extra.
- No product may bypass the gateway or access the database directly.
- API secrets are shown once, stored only as hashes, and revoked/regenerated if lost.
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

The most important unblocking workflow is API key generation for institutions and later engineers:

- Founder selects institution.
- Founder selects scopes and rate limit.
- System generates `client_id` and `client_secret`.
- Secret is displayed once.
- Institution engineer exchanges credentials for a bearer token with `POST /auth/token`.

## Phase 0 Handoff Target

Engineer 2 is unblocked only when these are working in sandbox:

- `POST /auth/token` returns JWT for a test institution key.
- `POST /ingest/students` creates Learner and returns AIN.
- `POST /ingest/results` creates AcademicRecord in DRAFT.
- `POST /govern/submit` moves status to SUBMITTED.
- `POST /govern/approve` moves status through the review/approval chain.
- `POST /govern/publish` creates signed Credential.
- `GET /access/passport` returns the student's full record.
- `GET /verify/:token` returns verification outcome.
- Founder Console can generate a new API key.
- Founder Console can enable authenticator-code security for the founder account.
- A test institution can be onboarded from creation through published credential.

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
- Scoped API-key tokens can perform institution ingestion and governance for their assigned institution.
- Basic per-key rate limiting is enforced from token metadata.
- Founder Console now connects to the live API for login, institution creation/listing, Authority Grant creation, API key generation, one-time secret display, key listing, and key revocation.
- Founder TOTP setup and login enforcement are implemented, with encrypted TOTP secret storage.
- Global API key management is implemented with institution context, search/filter UI, and safe listings that never expose secret hashes.
- `npm run smoke:api` verifies the live Supabase-backed API flow.
- Web app runs at `http://localhost:3000`.
- API runs at `http://localhost:4000`.

Important gaps against v3:

- Expand webhook management, dispute queue, BI, and founder security pages.
- Add production-grade founder MFA recovery policy and admin break-glass controls.
- Add keystore table and stable institution signing-key management.
- Add append-only audit hardening and published-record immutability enforcement at database level.
- Add AIN sequence table and manual-review path for medium-confidence identity matches.
- Align route names with v3 API contract where needed while preserving existing working routes during migration.

## Next Build Step

Next engineering move:

1. Add webhook registration and delivery log models.
2. Add database-backed automated workflow tests.
3. Add production signing-key management.
4. Add production-grade founder MFA recovery policy.
