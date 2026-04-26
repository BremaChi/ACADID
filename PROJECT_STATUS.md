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
- WSL Docker PostgreSQL helper script in `scripts/start-db-wsl.cmd`.
- GitHub Actions CI workflow in `.github/workflows/ci.yml`.
- Runtime setup guidance in `docs/runtime-options.md`.

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
- Local dashboard health check on `http://localhost:3000/`
- PostgreSQL running in WSL Docker as `acadid-postgres`.
- Initial Prisma migration applied to PostgreSQL.
- Seeded AcadID Super Admin: `founder@acadid.local`.
- API health check passes at `http://localhost:4000/api/health`.
- Founder admin login succeeds against the live database.
- End-to-end pilot flow verified:
  - Created pilot institution `AINi-00001`.
  - Created active Authority Grant.
  - Ingested learner and assigned `AIN-NG-2026-0000001`.
  - Created, approved, and published a result batch.
  - Verified issued credential with cryptographic status `VALID`.

Known validation note:

- `npm install` reports dependency vulnerabilities. These need review before production. Do not run force fixes blindly.
- Docker is available through WSL. The default WSL user did not have Docker socket permission, so Docker commands were run through `wsl -u root`.
- WSL needed a keepalive process while testing from Windows so Docker port forwarding stayed available.

## Local Runtime

Web app:

- Running at `http://localhost:3000`.

API app:

- Running at `http://localhost:4000` after PostgreSQL is running, migrations are applied, and seed data exists.

## Next Engineering Steps

1. Add database-backed workflow tests for institution onboarding, ingestion, governance, publishing, and verification.
2. Add real MOU document upload/storage metadata to Authority Grants.
3. Add verifier identity capture and IP hashing to verification events.
4. Add audit views in the web app.
5. Add registrar/institution staff user creation and membership management.
6. Configure stable production signing keys with `npm run crypto:keygen`.

## GitHub Status

Remote repository:

- `https://github.com/BremaChi/ACADID.git`

Already pushed:

- Monorepo foundation scaffold.
- Database migration and seed workflow.
- Web startup helper.

Current local work to push next:

- PostgreSQL WSL startup helper.
- API startup fix for compiled monorepo output.
- Runtime docs/status updates for live database verification.

## Immediate Recommendation

Add database-backed automated tests now that PostgreSQL is available locally.

Best production-safe database path:

- Use Docker Desktop only for local development.
- Use managed PostgreSQL for pilot/production when hosting is selected.
- Keep PostgreSQL as the system of record for speed, integrity, and future scale.
