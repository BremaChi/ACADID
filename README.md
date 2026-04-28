# AcadID

AcadID is a permanent academic identity infrastructure for Nigeria. It gives every learner a lifelong Academic Identity Number (AIN), stores institutional academic history in a stable core data center, and exposes credentials through controlled gateway services.

## Architecture Source Of Truth

The current authoritative source is:

- `C:\Users\HP\Downloads\AcadID_Architecture_Brief_v3.docx`

Current implementation memory from the v3 brief:

- `docs/architecture-brief-v3-memory.md`

Earlier note:

- `C:\Users\HP\Downloads\Acadid Architecture Brief Cleaned.docx` remains useful historical context.
- `D:\ACADID\AcadID_Architecture_Brief.html` exists but reads as all zero bytes in this environment.
- `D:\ACADID\AcadID_Authority_Partnership_Brief-1.docx` remains useful for partnership and registrar-facing positioning.

## Review Packet

The updated technical architecture packet is in:

- `architecture-review/00-review-brief.md`
- `architecture-review/01-mvp-architecture.md`
- `architecture-review/02-data-and-interfaces.md`
- `architecture-review/03-security-privacy-governance.md`
- `architecture-review/04-threat-model.md`
- `architecture-review/05-acceptance-test-plan.md`
- `architecture-review/06-review-agenda.md`

## Permanent Architecture Decisions

- Layer 0: Core Data Center.
- Layer 1: Controlled Gateway.
- Layer 2: Product Layer.
- Layer 3: External Partner Ecosystem.
- Every product talks to the core only through the gateway.
- Every learner has an internal UUID and a public AIN.
- Published academic records are immutable; amendments create versions.
- Credentials are issued as W3C Verifiable Credentials Data Model 2.0 payloads.
- Student sharing is controlled through scoped, revocable Access Grants.
- Institution authority is controlled through Authority Grants created from signed MOUs.
- Nigeria data residency and no individual data monetisation are product commitments.

## First Build Bias

Build the data center, gateway, auth, audit, Authority Grant workflow, Internal Admin Panel, and Institution Upload Portal before expanding to student mobile, employer verification, exam body APIs, and live score APIs.

## Runtime Notes

PostgreSQL remains the production database choice. Supabase PostgreSQL is now the active development database, connected through the backend API with `DATABASE_URL` and `DIRECT_URL` in the root `.env`.

Docker PostgreSQL is optional local fallback only, not part of the normal development workflow.

See `docs/runtime-options.md` for the available local and production database setup options.

Useful commands:

- `npm run db:generate`
- `npm run db:deploy`
- `npm run db:seed`
- `npm run smoke:api`

Current v3 checkpoint:

- Founder can create an institution and Authority Grant.
- Founder can generate a scoped API key.
- External clients can exchange `client_id` and one-time `client_secret` through `POST /auth/token`.
- Scoped API clients can ingest and govern records through the gateway without direct database access.
