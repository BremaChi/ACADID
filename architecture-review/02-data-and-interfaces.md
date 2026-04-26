# Data And Interfaces

## Identifier Rules

| Identifier | Visibility | Purpose |
| --- | --- | --- |
| `uuid` | Internal only | UUID v4 primary key for database entities |
| `ain` | Public | Lifelong learner-facing Academic Identity Number |
| `institution_id` | Public/display | Institution display identifier, such as `AINi-XXXX` |
| `credential_id` | Controlled public reference | Credential reference used for sharing and verification |
| `access_grant.token` | Secret bearer reference | URL-safe share token created by the learner |

Rules:

- Never expose internal UUIDs in public links, certificates, search, or user-facing reports.
- AIN is shareable but should not be enough to reveal private data.
- Credential references and access tokens must be high entropy and non-sequential.
- AIN sequence generation must be protected against duplicate issuance and enumeration abuse.

## Eight Core Entities

### Learner

Permanent identity for every human in the system.

Minimum fields:

- `uuid`
- `ain`
- `full_name`
- `date_of_birth`
- `phone`
- `nin`
- `jamb_id`
- `created_at`
- `identity_status`
- `guardian_id`

Design notes:

- `nin` must be encrypted if stored.
- `guardian_id` supports under-18 learners.
- Learners are not physically deleted from the core; legal erasure should be handled through allowed deletion/anonymisation policy.

### Institution

Verified school, university, polytechnic, college, or exam body.

Minimum fields:

- `uuid`
- `institution_id`
- `official_name`
- `type`
- `state`
- `tier`
- `signing_key_id`
- `mou_signed_at`
- `status`

### Enrolment

Relationship between a learner and an institution at a specific time.

Minimum fields:

- `uuid`
- `learner_id`
- `institution_id`
- `student_number`
- `level`
- `programme`
- `entry_date`
- `exit_date`
- `exit_type`
- `status`

### Academic Record

Raw structured academic data. Immutable after publication.

Minimum fields:

- `uuid`
- `enrolment_id`
- `period_type`
- `period_label`
- `subject_code`
- `subject_name`
- `ca_score`
- `exam_score`
- `total_score`
- `grade`
- `status`
- `published_at`

Status lifecycle:

- `Draft`
- `Submitted`
- `Reviewed`
- `Approved`
- `Published`
- `Amended`

### Credential

Signed, packaged, shareable representation of one or more academic records.

Minimum fields:

- `uuid`
- `learner_id`
- `institution_id`
- `type`
- `scope`
- `version`
- `signature`
- `vc_payload`
- `issued_at`
- `revoked_at`
- `revocation_reason`

Required:

- Store W3C Verifiable Credentials Data Model 2.0 compatible payloads.
- Exact proof profile remains a review decision: Data Integrity, JOSE/JWS, or SD-JWT.

### Verification Event

Permanent record of a third-party credential check.

Minimum fields:

- `uuid`
- `credential_id`
- `access_grant_id`
- `verifier_type`
- `verifier_name`
- `verifier_email`
- `ip_address`
- `outcome`
- `verified_at`
- `scope_viewed`

Protection:

- Encrypt verifier email.
- Hash IP address.
- Do not delete verification events; handle retention/anonymisation through policy.

### Access Grant

Student-created permission to view a credential scope.

Minimum fields:

- `uuid`
- `learner_id`
- `credential_id`
- `token`
- `scope`
- `recipient_label`
- `expires_at`
- `revoked_at`
- `created_at`
- `max_views`

Scopes:

- `Full`
- `GPA`
- `Semester`
- `Subject`

### Authority Grant

Legal/operational proof that an institution authorised AcadID to store and issue credentials on its behalf.

Minimum fields:

- `uuid`
- `institution_id`
- `mou_document_url`
- `signed_by_name`
- `signed_by_title`
- `signed_at`
- `effective_from`
- `expires_at`
- `permissions`
- `status`

Statuses:

- `Active`
- `Suspended`
- `Terminated`

Rule:

- No institution can publish credentials unless it has an active Authority Grant with the required permission.

## Identity Creation Flows

### Institution-Initiated Creation

Best MVP path:

1. Partner school uploads student register.
2. System checks name, date of birth, and school ID against existing learners.
3. Unmatched learners receive UUID and AIN.
4. SMS invite is sent where phone exists.
5. Student claims passport with name/date of birth and OTP.
6. Identity status becomes `Verified`.

### Student Self-Registration

Useful later:

1. Student creates passport independently.
2. System searches for existing match.
3. If no match exists, UUID and AIN are created.
4. Status remains `Unverified`.
5. Status upgrades only when an institution uploads or confirms records.

### Institution-Linked Registration

Clean onboarding path:

1. School generates QR or registration code.
2. Student scans or enters code.
3. Pre-populated record is confirmed.
4. OTP links phone number.
5. Passport becomes `Verified`.

## Gateway API Contract

### Ingestion Door

- `POST /ingest/students`
- `POST /ingest/results`
- `POST /ingest/bulk-upload`
- `POST /ingest/exam-body`
- `PATCH /ingest/results/:id`
- `POST /ingest/transfer-request`

### Governance Door

- `POST /govern/submit-batch`
- `POST /govern/approve-batch`
- `POST /govern/publish`
- `POST /govern/amend`
- `POST /govern/revoke`
- `POST /govern/reject-batch`

### Access Door

- `GET /access/passport`
- `GET /access/results`
- `POST /access/share-link`
- `GET /access/credentials`
- `POST /access/revoke-grant`
- `GET /access/verification-log`

### Verification Door

- `GET /verify/:token`
- `GET /verify/ref/:refnum`
- `POST /verify/bulk`
- `GET /verify/qr/:code`
- `GET /verify/status/:credId`
- `POST /verify/report`

## Transfer Model

Transfer does not move the passport. The AIN and passport remain permanent.

Transfer changes enrolment:

- Sending institution closes current enrolment.
- Prior records become read-only after exit date.
- Receiving institution opens new enrolment.
- Receiving institution gets read-only access to relevant prior history.
- New institution can add records only from its entry date forward.
- International transfer can generate a signed W3C VC export package.
