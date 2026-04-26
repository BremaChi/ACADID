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
- API dev helper script in `scripts/start-api.cmd`.

## Implemented Foundation

### API

The API has these first modules:

- Auth module for staff login, bearer token creation, `/auth/me`, and password verification.
- Admin module for institution creation, institution status updates, and Authority Grant creation.
- Ingestion Door for student register intake, learner matching/creation, AIN assignment, enrolment creation, and draft result batch creation.
- Governance Door for batch submission, review, approval, publication, rejection, amendment, and revocation.
- Access Door for learner passport, credential list, hashed share-link creation, grant revocation, and learner verification log.
- Verification Door for share-token, credential-reference, and credential-status checks.
- Platform services for Prisma, audit writing, Authority Grant enforcement, and credential signing.
- Admin routes are restricted to `ACADID_SUPER_ADMIN`.
- Ingestion routes are restricted to AcadID admins and institution operating roles.
- Governance routes are restricted to AcadID admins, Registrars, and Exam Officers.
- Institution staff routes now enforce institution membership, so staff cannot operate on another institution by changing an ID.
- Credential publication now uses Ed25519 JOSE/JWS signatures and embeds a proof in the VC payload.
- Credential signing is prepared outside the publish transaction so database writes remain fast under load.

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
- `npm test`

Known validation note:

- `npm install` reports dependency vulnerabilities. These need review before production. Do not run force fixes blindly.
- Docker Desktop, `psql`, and a local PostgreSQL service are not installed on this machine yet, so database migration and API runtime testing are still blocked locally.

## Local Runtime

Web app:

- Running at `http://localhost:3000`.

API app:

- Scaffolded and buildable.
- Start with `scripts/start-api.cmd` after PostgreSQL is running, migrations are applied, and seed data exists.

## Next Engineering Steps

1. Start PostgreSQL using Docker Compose or a local PostgreSQL install.
2. Run the first Prisma migration.
3. Seed the first AcadID Super Admin.
4. Start the API with `scripts/start-api.cmd`.
5. Implement institution onboarding persistence end to end.
6. Add real MOU document upload/storage metadata to Authority Grants.
7. Implement the three-tier workflow:
   - Draft.
   - Submitted.
   - Reviewed.
   - Approved.
   - Published.
8. Configure stable production signing keys with `npm run crypto:keygen`.
9. Add verifier identity capture and IP hashing to verification events.
10. Add audit views in the web app.
11. Expand tests from crypto/authority unit coverage into database-backed workflow tests once PostgreSQL is available.

## GitHub Status

Remote repository:

- `https://github.com/BremaChi/ACADID.git`

Already pushed:

- Monorepo foundation scaffold.
- Database migration and seed workflow.
- Web startup helper.

Current local work to push next:

- Student passport and credential access endpoints.
- Hashed Access Grant share-link creation and revocation.
- Public share-token verification with expiry, revocation, view-limit, and credential-status checks.

## Immediate Recommendation

Install or start PostgreSQL next so the API can run against a real database, then continue into institution onboarding and Authority Grant enforcement.
