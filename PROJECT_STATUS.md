# AcadID Project Status

## Current Build State

AcadID has moved from concept documents into a working TypeScript monorepo foundation.

Created:

- Architecture review packet in `architecture-review/`.
- MVP build blueprint in `MVP_BUILD_BLUEPRINT.md`.
- TypeScript monorepo root configuration.
- NestJS API app in `apps/api`.
- Next.js web app in `apps/web`.
- Prisma database package in `packages/database`.
- Shared domain package in `packages/shared`.
- Audit interface package in `packages/audit`.
- Credential signing adapter package in `packages/crypto`.
- Web dev helper script in `scripts/dev-web.cmd`.

## Implemented Foundation

### API

The API has these first modules:

- Admin module for institution creation, institution status updates, and Authority Grant creation.
- Ingestion Door scaffold for student/register/result upload entrypoints.
- Governance Door scaffold for batch submission, review, approval, publication, rejection, amendment, and revocation.
- Access Door scaffold for passport, credentials, share links, grant revocation, and verification log.
- Verification Door scaffold for token/reference/status verification.
- Platform services for Prisma, audit writing, and credential signing.

### Database

The Prisma schema includes the core AcadID model:

- Learner.
- Institution.
- User.
- InstitutionUser.
- AuthorityGrant.
- Enrolment.
- ResultBatch.
- AcademicRecord.
- Credential.
- AccessGrant.
- VerificationEvent.
- ImportFile.
- MouDocument.
- AuditEvent.

### Web

The web app currently provides an operations dashboard for the first foundation workflow:

- Phase 0 + Phase 1 build target.
- Gateway doors.
- Institution-to-published-credential workflow.

## Validation Completed

Completed successfully:

- `npm install`
- `npm run db:generate`
- `npm run typecheck`
- `npm run build`

Known validation note:

- `npm install` reports dependency vulnerabilities. These need review before production. Do not run force fixes blindly.

## Local Runtime

Web app:

- Running at `http://localhost:3000`.

API app:

- Scaffolded and buildable.
- Not started yet because PostgreSQL is not configured.

## Next Engineering Steps

1. Start PostgreSQL using Docker Compose or a local PostgreSQL install.
2. Run the first Prisma migration.
3. Seed the first AcadID Super Admin.
4. Implement real auth sessions and password verification.
5. Implement institution onboarding persistence end to end.
6. Implement Authority Grant enforcement with real MOU document metadata.
7. Implement student register ingestion.
8. Implement result batch ingestion.
9. Implement the three-tier workflow:
   - Draft.
   - Submitted.
   - Reviewed.
   - Approved.
   - Published.
10. Replace placeholder credential signing before pilot.
11. Add real Access Grant token hashing and verification.
12. Add audit views in the web app.
13. Add tests for Authority Grant enforcement, gateway boundaries, and result workflow.

## GitHub Status

Not pushed yet.

Reason:

- Git is not available on PATH in the current environment.
- No GitHub remote has been configured from this session.
- Pushing to GitHub is an external action and should happen only after the founder confirms the target repository.

## Immediate Recommendation

Before building more product features, set up Git/GitHub and make the first commit. This protects the foundation work before PostgreSQL migrations and deeper implementation begin.
