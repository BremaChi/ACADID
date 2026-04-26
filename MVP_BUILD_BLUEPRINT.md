# AcadID MVP Build Blueprint

## 1. Build Goal

Build the first working AcadID foundation: a secure infrastructure core where a founding institution can be onboarded, receive an Authority Grant, upload student/result data, pass results through the three-tier approval workflow, publish immutable academic records, and generate signed credential records with full audit logging.

This is not yet the full AcadID vision. It is the smallest serious foundation that proves the architecture is real.

## 2. Recommended First Product Slice

Build Phase 0 plus the narrowest useful part of Phase 1:

- Core Data Center.
- Controlled Gateway.
- Authentication and role-based access.
- Audit Logger.
- Internal Admin Panel.
- Institution onboarding.
- Authority Grant creation.
- Institution Upload Portal.
- Student register upload.
- Result upload.
- Draft -> Submitted -> Reviewed -> Approved -> Published workflow.
- Credential record generation.

Defer until after the foundation works:

- Native mobile student app.
- Employer billing.
- Paystack.
- Exam body APIs.
- Live Score Entry API.
- SDKs.
- Advanced analytics.
- International transfer packages.

## 3. Recommended Tech Stack

### Backend

- Node.js with TypeScript.
- NestJS or Fastify.
- PostgreSQL as the primary database.
- Prisma or Drizzle as ORM/query layer.
- Zod or class-validator for request validation.

Recommendation: **NestJS + PostgreSQL + Prisma** for the first build because the domain has many modules, roles, workflows, and policy boundaries.

### Frontend

- Next.js with TypeScript.
- Tailwind CSS.
- Server-side route protection.
- Admin/institution dashboard first; student UI later.

### Auth

- Email/password plus MFA for staff users.
- OTP-capable design for future student passport claiming.
- Role-based access control enforced in backend policy guards.

### Storage

- Object storage for MOU documents, import files, and exported packages.
- Store only file metadata in PostgreSQL.
- Encrypt sensitive files at rest.

### Hosting

- MVP production data should use Nigeria-hosted infrastructure where possible.
- Development can run locally.
- Avoid foreign telemetry or logging tools that capture student/institution personal data.

## 4. Monorepo Shape

Recommended repo structure:

```text
acadid/
  apps/
    api/
    web/
  packages/
    database/
    shared/
    crypto/
    audit/
  docs/
    architecture-review/
    decisions/
```

First implementation can start with:

- `apps/api`: backend API.
- `apps/web`: admin and institution web portal.
- `packages/database`: schema, migrations, seed data.
- `packages/shared`: shared types and validation schemas.

## 5. Core Modules

### Identity Module

Responsibilities:

- Create Learner records.
- Generate UUID v4.
- Generate AIN.
- Match learner imports against existing records.
- Track `Verified` vs `Unverified` identity status.

MVP matching inputs:

- Full name.
- Date of birth.
- Student number/school ID.
- Institution ID.

### Institution Module

Responsibilities:

- Create Institution records.
- Track institution type, state, status, and partnership tier.
- Manage institution staff users.
- Link signing key metadata.

### Authority Module

Responsibilities:

- Store MOU metadata.
- Create Authority Grant.
- Enforce Authority Grant status before publication.
- Block publication for Suspended or Terminated institutions.

### Ingestion Module

Responsibilities:

- Upload student register.
- Upload result batch.
- Validate import structure.
- Flag duplicates and invalid fields.
- Create Draft records.

### Governance Module

Responsibilities:

- Submit batch.
- Review batch.
- Approve batch.
- Publish batch.
- Reject batch.
- Amend published records.
- Revoke credentials.

### Credential Module

Responsibilities:

- Package approved academic records into Credential records.
- Store `vc_payload`.
- Store signature metadata.
- Track credential version.
- Track revocation state.

MVP signing approach:

- Implement a placeholder signing adapter interface first.
- Use a real asymmetric signing implementation before pilot.
- Keep the interface compatible with W3C Verifiable Credentials Data Model 2.0.

### Access Module

Responsibilities:

- Prepare for student share links.
- Create Access Grant records.
- Revoke Access Grants.
- Enforce scope and expiry.

MVP note:

- Access Grants can be implemented as backend capability before full student UI exists.

### Verification Module

Responsibilities:

- Verify credential reference or token.
- Check signature, status, scope, expiry, and access grant.
- Create Verification Event.
- Return confirm, deny, discrepancy, or revoked.

### Audit Module

Responsibilities:

- Write append-only audit events.
- Capture actor, role, action, target, timestamp, outcome, and reason.
- Provide internal admin audit views.

## 6. Database Tables

Minimum tables:

- `learners`
- `institutions`
- `users`
- `institution_users`
- `authority_grants`
- `enrolments`
- `academic_records`
- `result_batches`
- `credentials`
- `access_grants`
- `verification_events`
- `audit_events`
- `import_files`
- `mou_documents`

Important constraints:

- `learners.uuid` is primary key.
- `learners.ain` is unique.
- `institutions.institution_id` is unique.
- `credentials.uuid` is internal primary key.
- Public credential references must be non-sequential.
- `academic_records` should not be updated after Published; amendments create new versions or amendment records.
- `audit_events` should be append-only at application level.

## 7. First API Contract

### Auth

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/mfa/verify`
- `GET /auth/me`

### Admin

- `POST /admin/institutions`
- `GET /admin/institutions`
- `PATCH /admin/institutions/:id/status`
- `POST /admin/institutions/:id/authority-grants`

### Ingestion Door

- `POST /ingest/students`
- `POST /ingest/results`
- `POST /ingest/bulk-upload`
- `GET /ingest/batches`
- `GET /ingest/batches/:id`

### Governance Door

- `POST /govern/submit-batch`
- `POST /govern/review-batch`
- `POST /govern/approve-batch`
- `POST /govern/publish`
- `POST /govern/reject-batch`
- `POST /govern/amend`
- `POST /govern/revoke`

### Access Door

- `GET /access/passport`
- `GET /access/credentials`
- `POST /access/share-link`
- `POST /access/revoke-grant`
- `GET /access/verification-log`

### Verification Door

- `GET /verify/:token`
- `GET /verify/ref/:refnum`
- `GET /verify/status/:credId`

## 8. Roles And Permissions

### AcadID Super Admin

- Create institutions.
- Review onboarding.
- Create/suspend Authority Grants.
- View audit logs.
- Manage platform incidents.

### Institution Registrar

- Final approve.
- Publish.
- Amend.
- Revoke.
- Manage institution staff.

### Exam Officer

- Review submitted batches.
- Reject batches with reason.
- Escalate issues.

### Data Entry Officer

- Upload registers.
- Create draft result batches.
- Edit drafts.
- Submit for review.

### Student

- Later phase for UI.
- Backend model should support passport, access grants, and verification log.

### Verifier

- Public or account-based access to Verification Door.
- Cannot access private academic data without valid Access Grant.

## 9. First End-To-End Workflow

1. AcadID Admin creates Institution.
2. Institution signs MOU.
3. Admin creates Authority Grant.
4. Registrar and staff users are created.
5. Data Entry Officer uploads student register.
6. System creates or matches Learners and Enrolments.
7. Data Entry Officer uploads result batch.
8. Batch starts as Draft.
9. Data Entry Officer submits batch.
10. Exam Officer reviews or rejects.
11. Registrar approves.
12. Registrar publishes.
13. Academic Records become Published.
14. Credential records are generated.
15. Audit events exist for every step.

## 10. First Sprint Backlog

### Sprint 1: Project Foundation

- Create monorepo.
- Set up API and web apps.
- Set up PostgreSQL.
- Add ORM migrations.
- Add environment config.
- Add base auth.
- Add seed data for one AcadID admin.

Current status: scaffolded, with staff login and Super Admin route protection added. PostgreSQL still needs to be started locally before migrations and seed can run.

### Sprint 2: Core Data Center

- Implement Learner, Institution, User, Authority Grant, Enrolment models.
- Implement AIN generator.
- Implement role model.
- Implement audit event writer.

### Sprint 3: Institution Onboarding

- Build admin institution creation.
- Build Authority Grant creation.
- Build institution staff creation.
- Add institution-scoped permissions.

### Sprint 4: Ingestion

- Build student register upload.
- Build result batch upload.
- Add validation and duplicate flags.
- Store import files and batch metadata.

### Sprint 5: Governance

- Implement Draft, Submitted, Reviewed, Approved, Published.
- Add rejection flow.
- Add Registrar-only publish.
- Add audit logging for transitions.

### Sprint 6: Credentials And Verification Skeleton

- Generate Credential records on publish.
- Store VC-compatible payload.
- Add signing adapter.
- Add credential status endpoint.
- Add basic verification endpoint.

## 11. Launch Gate For First Partner Pilot

Pilot is not ready until:

- Institution onboarding works.
- Authority Grant enforcement works.
- Staff roles are scoped to institution.
- Student register upload works.
- Result upload works.
- Three-tier approval works.
- Publication creates immutable records.
- Credential records are generated.
- Audit log covers every sensitive action.
- Suspended institution cannot publish.
- Revoked credential fails verification.
- Backup and restore have been tested.

## 12. Founder-Level Build Strategy

Do not build all six products at once.

The first win is not a beautiful app. The first win is institutional trust:

- A school can sign.
- A school can upload.
- A Registrar can approve.
- A student record can become permanent.
- A credential can be verified.
- Every action can be audited.

Once that foundation works, the Student Mobile App and Employer Verification Portal become valuable because they sit on real trusted data.
