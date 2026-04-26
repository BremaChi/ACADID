# Security, Privacy, And Governance

## Security Baseline

Required for Phase 0 and Phase 1:

- MFA for AcadID admins, registrars, exam officers, and data entry officers.
- Role-based access control scoped by institution.
- Tenant isolation across institutions.
- Gateway-only core access.
- Encrypted traffic for all client and internal service calls.
- Encrypted storage for NIN, verifier email, sensitive documents, and credentials.
- Managed key storage for institution signing keys.
- Append-only audit logging.
- Rate limiting on gateway doors.
- Backup and restore testing.
- Security review before public pilot.

## Authority Model

### AcadID Admin

Can:

- Onboard institutions.
- Review due diligence.
- Manage partnership tiers.
- Monitor fraud/disputes.
- View platform audit and compliance tools.

Cannot:

- Publish or amend academic records in an institution's name without an active Authority Grant and Registrar workflow.

### Institution Registrar

Can:

- Give final approval for publication.
- Publish records.
- Amend published records.
- Revoke credentials.
- Assign institution staff roles.

### Exam Officer

Can:

- Review submitted result batches.
- Approve or reject batches before Registrar decision.

Cannot:

- Publish final results.
- Amend published records.

### Data Entry Officer

Can:

- Create draft results.
- Edit draft batches.
- Submit batches for review.

Cannot:

- Edit submitted batches.
- Publish credentials.

### Student/Learner

Can:

- Claim passport.
- View own academic passport.
- Create Access Grants.
- Revoke Access Grants.
- View verification log.
- Raise disputes.

Cannot:

- Edit institutional academic claims.

### Verifier

Can:

- Verify credentials within granted scope.
- Receive confirm, deny, discrepancy, or revoked result.

Cannot:

- Browse records by AIN alone.
- Access unshared academic data.

## Result Governance Workflow

| Stage | Actor | Rule |
| --- | --- | --- |
| Draft | Data Entry Officer | Editable only by data entry account |
| Submitted | Data Entry Officer | Batch locked from data-entry edits |
| Reviewed | Exam Officer | Can approve or reject with notes |
| Approved | Registrar | Ready to publish but not visible yet |
| Published | Registrar | Signed credential generated; record immutable |
| Amended | Registrar only | New signed version created; original preserved |

Rejection rules:

- Exam officer rejection returns batch to `Draft`.
- Registrar rejection returns batch to `Submitted`.
- All rejection reasons are logged.
- Three rejections trigger escalation to Internal Admin Panel.

Amendment rules:

- Only Registrar can amend published records.
- Amendment requires original value, corrected value, written reason, and Registrar signature.
- Original value is never overwritten.
- Student is notified immediately.

## Authority Grants

An Authority Grant is created only after MOU signing.

It must define:

- Institution.
- Authorised signer.
- Effective date.
- Expiry where applicable.
- Publishing permissions.
- Credential types allowed.
- Status.

Enforcement:

- `Active`: institution can publish within permissions.
- `Suspended`: no new publication; existing verification remains governed by credential status.
- `Terminated`: no new publication; offboarding/export workflow begins.

## Data Governance Principles

### Least Privilege

Every role sees only what it needs:

- Lecturers see assigned students only, if lecturer role is later introduced.
- Registrars see their institution.
- Employers see only learner-shared scopes.
- AcadID staff see only operationally necessary data.

### Immutability

Published records are never overwritten. Corrections create new versions and preserve original history.

### Student Ownership

From age 18, learners control sharing permissions through Access Grants. AcadID is custodian, not owner, of student data.

### Nigeria Data Residency

Production academic and personal data must be stored on Nigeria-based infrastructure for MVP. No cross-border data transfer should occur without explicit consent and legal review.

### Full Audit Trail

Every sensitive action logs:

- Timestamp.
- Actor ID.
- Actor role.
- Institution ID.
- IP hash where appropriate.
- Action type.
- Affected record.
- Outcome.
- Reason for privileged changes.

Audit logs cannot be deleted through normal application flows.

### No Data Monetisation

Individual student data is never sold or shared for commercial purposes. Only aggregate, anonymised analytics may be published, and this must appear in every MOU.

## NDPA 2023 Compliance Features

Required product capabilities:

- Data Subject Access Request workflow.
- Right to erasure support where legally possible.
- Granular consent management.
- Data portability export.
- 72-hour breach notification protocol.
- Configurable retention policy.
- Subprocessor/vendor register.
- Institution offboarding export.

## W3C Verifiable Credentials

AcadID credentials must support W3C Verifiable Credentials Data Model 2.0 payloads.

Benefits:

- Cryptographic proof.
- Selective disclosure path.
- Revocation support.
- Privacy-respecting sharing.
- International interoperability.

Open technical decision:

- Select the proof profile before implementation: Data Integrity, JOSE/JWS, or SD-JWT.

CTO default:

- Use Data Integrity if reliable libraries exist in the chosen stack.
- Use JOSE/JWS for MVP if Data Integrity support threatens delivery speed.
- Keep the Credential entity flexible enough to migrate later.
