# Threat Model

## Scope

This threat model covers the first foundation build: Core Data Center, Controlled Gateway, Internal Admin Panel, Institution Upload Portal, Authority Grants, student/result ingestion, governance approval, credential issuance, access grants, verification, audit logging, and offboarding.

## High-Value Assets

- Learner identity records.
- AIN issuance sequence.
- NIN/JAMB/BVN identity anchors.
- Academic records.
- Published credentials.
- W3C VC payloads and signatures.
- Institution signing keys.
- Authority Grants and MOU documents.
- Access Grant tokens.
- Verification Events.
- Audit logs.
- Admin and Registrar accounts.

## Primary Threats And Controls

| Threat | Impact | MVP Controls |
| --- | --- | --- |
| Gateway bypass | Product or partner touches core directly | Network isolation, private core services, gateway-only service permissions |
| Fraudulent Authority Grant | Fake institution gains publishing power | Due diligence, MOU document verification, signer verification, admin approval |
| Stolen Registrar account | Unauthorized publication or amendment | MFA, step-up auth, device/session monitoring, approval audit |
| AIN enumeration | Attackers infer valid learners | AIN search rate limits, no private data by AIN alone, high-entropy credential/access tokens |
| Identity match error | Student gets another learner's record | Match confidence scoring, manual review, partial match display, dispute process |
| Import poisoning | Bad records become official | Validation, three-tier approval, batch rejection notes, amendment workflow |
| Published record tampering | Academic history becomes untrustworthy | Immutability, signed versions, append-only audit |
| Issuer key compromise | Credentials from institution become suspect | Managed key storage, key rotation, incident playbook, status/revocation support |
| Access Grant leak | Unintended third party views records | Expiry, revocation, max views, scoped disclosure, verification event visibility |
| Consent bypass | Verifier sees unshared records | Access Door scope enforcement, Verification Door checks, audit logging |
| Partner API abuse | Bulk scraping or fraudulent checks | API keys, rate limits, contracts, anomaly detection, verification billing controls |
| Insider browsing | Staff view learner data without need | Least privilege, audit review, support access controls |
| Cross-border leakage | Breach of residency promise | Nigeria-hosted services, vendor review, no personal data in external telemetry |
| Audit tampering | Misconduct cannot be investigated | Append-only audit, restricted writers, backup integrity checks |

## Abuse Cases To Test

- A product attempts to query the Core Data Center directly.
- A suspended Authority Grant attempts to publish a credential.
- A verifier tries to verify using only an AIN.
- A verifier reuses an expired Access Grant token.
- A student revokes a grant while a verifier still has the link.
- A registry user tries to edit a submitted batch.
- An exam officer tries to publish without Registrar approval.
- A Registrar amends a record without reason/signature.
- A duplicate student register upload tries to create a second AIN.
- A malicious actor submits high-volume AIN lookup attempts.
- A partner API sends records outside its contracted scope.
- A revoked credential is presented as valid.

## Identity Matching Risks

The MVP bootstrap anchor is school ID plus date of birth. This is practical but not perfect.

Controls:

- Include full name normalization.
- Show partial match for student confirmation during claiming.
- Use manual review queue for ambiguous matches.
- Link phone through OTP voluntarily.
- Add JAMB/NIN/BVN anchors later, with encryption and legal review.
- Keep merge/split correction workflows auditable.

## Incident Playbooks

### Issuer Key Compromise

- Suspend affected institution signing key.
- Stop new issuance for affected institution.
- Identify impacted credentials.
- Rotate key.
- Update credential status records.
- Notify institution and affected learners.
- Publish verifier guidance where needed.

### Bad Result Publication

- Suspend or supersede affected credential.
- Preserve original record.
- Require Registrar amendment with reason.
- Issue new signed version.
- Notify learner and institution.
- Add incident note to audit trail.

### Unauthorized Access

- Disable actor/session.
- Preserve audit evidence.
- Scope affected learners and institutions.
- Notify internal incident owner.
- Follow NDPA/legal notification analysis.
- Document corrective action.
