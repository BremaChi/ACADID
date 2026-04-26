# Architecture Review Agenda

## Goal

Use this review to turn AcadID from a strong founder architecture into implementation-ready engineering decisions.

## Participants

- Founder/product owner.
- Fractional CTO or technical lead.
- Backend/platform engineer.
- Security/privacy reviewer.
- Legal/compliance reviewer.
- Registrar-domain advisor.
- Design/product lead if available.

## Pre-Read

- `00-review-brief.md`
- `01-mvp-architecture.md`
- `02-data-and-interfaces.md`
- `03-security-privacy-governance.md`
- `04-threat-model.md`
- `05-acceptance-test-plan.md`
- `C:\Users\HP\Downloads\Acadid Architecture Brief Cleaned.docx`

## 120-Minute Review

| Time | Topic | Decision Needed |
| --- | --- | --- |
| 0-10 min | Founder vision and architecture thesis | Confirm AcadID is infrastructure-first, not app-first |
| 10-25 min | Four-layer model | Confirm gateway-only access and product/core boundaries |
| 25-45 min | Eight core entities | Confirm entity set and first schema direction |
| 45-60 min | AIN and identity matching | Confirm AIN format, UUID secrecy, MVP matching anchors |
| 60-75 min | Gateway doors and API groups | Confirm `/ingest`, `/govern`, `/access`, `/verify` contract |
| 75-90 min | Security, governance, NDPA | Confirm Authority Grants, consent, audit, residency, no monetisation |
| 90-105 min | Credential standard | Choose W3C VC proof profile for MVP |
| 105-115 min | Roadmap | Confirm Phase 0 and Phase 1 as first build programme |
| 115-120 min | Launch gates | Confirm acceptance tests required before pilot |

## Decision Log

| Decision | Recommended Default | Owner |
| --- | --- | --- |
| First build scope | Phase 0 + narrow Phase 1 foundation | Founder + CTO |
| Core access model | Gateway-only, no product direct core access | CTO |
| Learner public ID | AIN format `AIN-NG-YYYY-XXXXXXX` | CTO |
| Internal ID | UUID v4, never public | CTO |
| MVP identity anchor | School ID + date of birth, with name matching | Product + CTO |
| Later identity anchors | Phone, JAMB, NIN, BVN | Product + legal |
| Credential payload | W3C VC Data Model 2.0 | CTO |
| Proof profile | Data Integrity if library support is strong; otherwise JOSE/JWS for MVP | CTO |
| Authority model | Active Authority Grant required for publication | Legal + CTO |
| Data residency | Nigeria-hosted production data for MVP | Founder + legal |
| Approval workflow | Data Entry Officer -> Exam Officer -> Registrar | Product + registrar advisor |

## Open Questions

- Which institution type is the first pilot: secondary school, university, polytechnic, or exam body?
- Which credential ships first: result slip, transcript, certificate, or all three?
- What exact CSV/XLSX template will founding institutions accept?
- Who is allowed to sign the first Authority Grant at each institution?
- Which Nigerian hosting provider or cloud arrangement satisfies the residency commitment?
- Will the first student app be native mobile immediately, or should Phase 2 begin with a responsive web passport?
- What data can be included in aggregate analytics without creating re-identification risk?

## Review Exit Criteria

The architecture is implementation-ready when:

- Phase 0 and Phase 1 build scope is locked.
- AIN generation and identity matching rules are locked.
- Core entities are accepted as the stable model.
- Gateway endpoint groups are accepted as the first API boundary.
- Authority Grant enforcement is accepted as mandatory.
- W3C VC proof profile is selected or time-boxed for proof-of-concept.
- Launch-gate acceptance tests are approved.
