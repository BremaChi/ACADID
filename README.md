# AcadID

AcadID is a permanent academic identity infrastructure for Nigeria. It gives every learner a lifelong Academic Identity Number (AIN), stores institutional academic history in a stable core data center, and exposes credentials through controlled gateway services.

## Architecture Source Of Truth

The current authoritative source is:

- `C:\Users\HP\Downloads\Acadid Architecture Brief Cleaned.docx`

Earlier note:

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

PostgreSQL remains the production database choice. Local Docker is only a development convenience, not a production requirement.

See `docs/runtime-options.md` for the available local and production database setup options.
