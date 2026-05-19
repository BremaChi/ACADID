# Transfer And Rollover Disputes Contract

Core Platform Team owns these Data Center/Gateway roots. Product teams must call these APIs instead of writing transfer, rollover, or dispute state directly.

## Transfer Requests

`POST /api/govern/transfers`

Creates a durable transfer request for an active learner enrolment.

Required human session:

- Registrar or authorized institution officer.
- Institution scope is enforced from the verified session.

Body:

```json
{
  "institutionId": "AINi-00001",
  "enrolmentId": "uuid",
  "toInstitutionId": "uuid",
  "toInstitutionNameSubmitted": "Future Academy",
  "toInstitutionContactEmail": "registrar@example.edu.ng",
  "reason": "Learner is relocating to another state."
}
```

Rules:

- `toInstitutionId` or `toInstitutionNameSubmitted` is required.
- Source enrolment must be active and owned by the source institution.
- Internal learner UUID is never used as a public identity in product UI.
- Audit action: `transfer_request.create`.

`GET /api/govern/transfers?status=&direction=&institutionId=`

Lists transfer requests. Institution users see only incoming/outgoing requests for their institution. Founder Admin may filter by institution.

`POST /api/govern/transfers/:id/review`

Body:

```json
{
  "decision": "APPROVE",
  "note": "Transfer approved after registrar review."
}
```

Allowed decisions:

- `APPROVE`
- `REJECT`
- `CANCEL`

Approval behavior:

- Marks the source enrolment `TRANSFERRED_OUT`.
- Sets exit type to `TRANSFER`.
- Creates an approved `RolloverRecord` with decision `TRANSFERRED_OUT`.
- Marks the transfer request `COMPLETED`.
- Audit action: `transfer_request.complete`.

## Rollover Disputes

`POST /api/govern/rollovers/:id/disputes`

Creates a `Dispute` linked to a rollover record.

Body:

```json
{
  "title": "Transfer disputed",
  "reason": "Guardian says the transfer should not have been processed.",
  "priority": "HIGH",
  "reporterName": "Parent Name",
  "reporterEmail": "parent@example.com"
}
```

Behavior:

- Creates a `Dispute` with category `ROLLOVER`.
- Links it to the `RolloverRecord`.
- If the rollover came from a transfer request, marks that transfer request `DISPUTED`.
- Audit action: `rollover.dispute.create`.

`POST /api/govern/rollovers/:id/disputes/resolve`

Body:

```json
{
  "resolutionNote": "Registrar confirmed consent evidence and retained the audit record."
}
```

Behavior:

- Marks the linked dispute `RESOLVED`.
- Keeps resolution note on the rollover record.
- Restores linked transfer request to `COMPLETED` if it was disputed.
- Audit action: `rollover.dispute.resolve`.

## Founder Console Data

`GET /api/admin/academic-operations` now includes:

- `metrics.requestedTransfers`
- `metrics.disputedTransfers`
- `transferStatus`
- `recentTransfers`
- `disputedRollovers`
- institution health flags for active transfer attention

## Product Guidance

Institution Portal should use this contract for its Transfers and Disputes pages. Founder Console should read the aggregate admin endpoint for operational health and use the govern endpoints for specific transfer/dispute actions when needed.
