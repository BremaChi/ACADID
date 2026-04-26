# Acceptance Test Plan

## Identity And AIN

- Learner creation assigns internal UUID v4 and public AIN.
- Internal UUID is never exposed in public API responses, links, reports, or UI.
- AIN follows `AIN-NG-YYYY-XXXXXXX` format.
- Duplicate student import does not create duplicate AIN without manual review.
- Student self-registration can create an `Unverified` passport.
- Institution upload or code-based claiming can upgrade passport to `Verified`.

## Institution And Authority

- Institution onboarding creates an Institution record.
- MOU signing creates an Authority Grant.
- Institution cannot publish without an active Authority Grant.
- Suspended Authority Grant blocks new publication.
- Terminated Authority Grant triggers export/offboarding workflow.
- Registrar and staff roles are scoped to their institution.

## Ingestion Door

- Student register upload validates required fields.
- Result upload accepts valid CSV/XLSX data.
- Corrupted import file is rejected with actionable errors.
- Invalid score/grade values are flagged.
- Duplicate matriculation/student numbers are flagged.
- Exam body ingestion is blocked unless partner agreement/API key is active.

## Governance Door

- Data Entry Officer can create and edit Draft batches.
- Data Entry Officer can submit a batch.
- Submitted batch is locked from data-entry edits.
- Exam Officer can approve or reject with written reason.
- Registrar can approve and publish.
- Registrar rejection returns the batch to Submitted.
- Three rejections create an escalation flag.
- Every workflow transition creates an audit event.

## Credential Issuance

- Published records generate Credential records.
- Credential includes `vc_payload`, signature, issuer, learner, scope, version, and issued timestamp.
- Published academic records become immutable.
- Student is notified after publication.
- Verification status endpoint reflects active credential state.

## Amendment And Revocation

- Only Registrar can amend a published record.
- Amendment requires original value, corrected value, reason, and Registrar signature.
- Original record remains preserved.
- Amended record creates a new signed version.
- Revoked credentials fail verification.
- Revocation reason is stored.

## Access Door

- Student can view passport and credentials.
- Student can create scoped Access Grant.
- Access Grant can expire.
- Student can revoke Access Grant.
- Revoked or expired Access Grant fails future verification.
- Student can view Verification Event history.
- Under-18 guardian linkage can be represented without giving guardian unrestricted edit rights.

## Verification Door

- Verifier can validate by share token.
- Verifier can validate by QR/ref only when a valid access path exists.
- Verifier sees only granted scope.
- Verifier receives confirm, deny, revoked, or discrepancy status.
- Bulk verification requires approved account/API key.
- Every verification creates a Verification Event.
- Verification by AIN alone never reveals private academic data.

## Gateway Boundary

- Product services cannot call Core Data Center directly.
- External partners cannot call Core Data Center directly.
- All gateway doors enforce authentication or approved public verification rules.
- Rate limits apply to verification and lookup endpoints.
- Unauthorized scopes are denied and audited.

## Compliance And Operations

- Audit logs include actor, timestamp, action, affected record, and outcome.
- Sensitive verifier email is encrypted.
- IP addresses are hashed where stored.
- Institution export can be generated for offboarding.
- Data portability export can be produced for learner request.
- Data residency checks confirm no personal data is sent to unapproved foreign services.
- Production learner data is blocked from AI training or prompt pipelines.

## Launch Gate

Do not launch a founding partner pilot until these pass:

- Authority Grant enforcement.
- Three-tier result approval.
- Immutable publication with amendment versioning.
- Signed credential generation.
- Access Grant creation/revocation.
- Verification event logging.
- Gateway-only core access.
- Backup/restore test.
- Basic incident playbooks.
