# AcadID Architecture Review Brief

## Purpose

This packet prepares AcadID for technical architecture review, engineering planning, partner due diligence, and founder-level technical explanation. It reflects the cleaned architecture brief, not the earlier partnership-only material.

## Architecture Thesis

AcadID is not just a result app. It is permanent academic identity infrastructure.

The stable part is the Core Data Center. Products can change, improve, or disappear, but learner identity, academic records, credentials, verification history, access grants, and authority grants remain stable. Every product communicates through the gateway. Nothing touches the core directly.

## Four-Layer Model

| Layer | Name | Responsibility |
| --- | --- | --- |
| Layer 3 | External Partners | WAEC, NECO, JAMB, NYSC, employers, foreign universities, embassies, HR platforms |
| Layer 2 | Products | Student Mobile App, Institution Upload Portal, Employer Verification Portal, Exam Body Ingest API, Live Score Entry API, Internal Admin Panel |
| Layer 1 | Controlled Gateway | Authentication, authorisation, audit logging, rate limiting, scope enforcement, consent enforcement |
| Layer 0 | Core Data Center | Permanent source of truth for the eight core entities |

## Core Identity Model

Every learner has two IDs:

- `uuid`: internal UUID v4 database anchor, never shown to users.
- `ain`: public Academic Identity Number, shown to learners, institutions, and verifiers.

AIN format:

```text
AIN-NG-2026-0004491
```

AIN meaning:

- `AIN`: platform prefix.
- `NG`: ISO country code.
- `2026`: first enrolment year in AcadID.
- `0004491`: zero-padded sequence number for that year.

The AIN is assigned, never chosen. It does not change when a learner changes school, changes name, transfers internationally, graduates, or continues to higher education.

## Eight Core Entities

- Learner.
- Institution.
- Enrolment.
- Academic Record.
- Credential.
- Verification Event.
- Access Grant.
- Authority Grant.

These are the conceptual foundation of the data center. Product-specific tables can exist later, but these eight entities must remain stable and backward-compatible.

## Review Objectives

- Validate the four-layer architecture and gateway-only access model.
- Confirm the first build phase and what must be deferred.
- Confirm AIN generation, UUID handling, and identity matching rules.
- Confirm the eight core entities are sufficient for first build.
- Confirm W3C Verifiable Credentials Data Model 2.0 payload support for credentials.
- Confirm governance, consent, immutability, data residency, and audit requirements.
- Convert open architecture decisions into implementation-ready defaults.

## Non-Negotiable Commitments

- No product accesses the Core Data Center directly.
- Registrar/institution authority is required before publishing, amending, or revoking institutional records.
- Student sharing is controlled through scoped, time-limited, revocable Access Grants.
- Published records are never overwritten; corrections create signed versions.
- Every sensitive action is logged with actor, time, affected record, and outcome.
- Individual student data is never sold or shared for commercial monetisation.
- Production data is hosted in Nigeria for MVP unless a later MOU/legal review explicitly permits otherwise.

## Current CTO Recommendation

Start with Phase 0 and Phase 1 as one disciplined foundation programme:

- Core database schema.
- UUID and display ID systems.
- Controlled gateway with four doors.
- Auth engine.
- Audit logger.
- Internal Admin Panel.
- Authority Grant and MOU workflow.
- Institution Upload Portal.
- Student register and result upload.
- Three-tier approval workflow.

Student mobile and employer verification should come after real institutional data is flowing.
