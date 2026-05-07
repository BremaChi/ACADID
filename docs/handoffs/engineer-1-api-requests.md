# Engineer 1 API Requests

Owner: Engineer 1 / Data Center API  
Purpose: queue for product engineers who need new backend roots, fields, or contract changes  
Status: Active

## How To Add A Request

Copy this template into the Open Requests section:

```md
### REQ-YYYYMMDD-001: Short Title

- Product:
- Requested by:
- Blocking level: BLOCKED | NEEDED_SOON | NICE_TO_HAVE
- User story:
- Proposed endpoint or change:
- Required fields:
- Actor/scope:
- Audit event:
- Privacy/security notes:
- Expected response:
- Engineer 1 decision: PENDING
```

## Open Requests

### REQ-20260507-001: v5 Academic Operations Data Center Roots

- Product: Institution Portal, Founder Console
- Requested by: Founder / Architecture Brief v5
- Blocking level: BLOCKED
- User story: Engineer 2 needs academic setup, scoped staff assignment, result upload, and rollover APIs before the private Institution Portal dashboard can be built correctly.
- Proposed endpoint or change: Add Data Center roots for AcademicSession, AcademicStructure, assigned staff scopes, expanded ResultBatch workflow, and RolloverRecord.
- Required fields: see `docs/architecture-brief-v5-memory.md`.
- Actor/scope: Registrar, Exam Officer, Data Entry Officer, Departmental Officer, Founder Admin.
- Audit event: every create/update/submit/review/approve/publish/reject/rollover/reopen action must emit user id, role, institution id, endpoint, action, entity, outcome, and request id.
- Privacy/security notes: enforce institution id from JWT and assigned scopes in the gateway; do not trust UI hiding; do not let product API keys perform human institution actions.
- Expected response: API contracts, Prisma migration, service enforcement, tests, and Founder Console visibility.
- Engineer 1 decision: PARTIAL - v5 schema foundation is implemented and migrated. AcademicSession and AcademicStructure setup endpoints are implemented and documented. Assigned-scope enforcement, rollover behavior, and Founder Console v5 surfaces remain open.

## Recently Completed

### REQ-20260501-001: Institution Portal Application Intake

- Product: Institution Portal
- Requested by: Founder / Engineer 2 handoff
- Blocking level: BLOCKED
- Outcome: COMPLETED
- Implemented:
  - `GET /api/portal/mou-version`
  - `POST /api/portal/upload-urls`
  - `POST /api/portal/institution-applications`
  - Founder Console Institution Applications review flow
- Contract: `docs/api/institution-portal-contract.md`
