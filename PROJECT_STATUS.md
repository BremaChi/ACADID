# AcadID Project Status

## Current Build State

AcadID has moved from concept documents into a working TypeScript monorepo foundation.

Latest architecture source:

- `C:\Users\HP\Downloads\AcadID_Architecture_Brief_v3.docx`
- Persistent project memory: `docs/architecture-brief-v3-memory.md`

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
- Optional WSL Docker PostgreSQL fallback helper script in `scripts/start-db-wsl.cmd`.
- GitHub Actions CI workflow in `.github/workflows/ci.yml`.
- Runtime setup guidance in `docs/runtime-options.md`.
- Architecture v3 memory note in `docs/architecture-brief-v3-memory.md`.
- Founder authenticator-code security for the Founder Console.

## Implemented Foundation

### API

The API has these first modules:

- Auth module for staff login, bearer token creation, `/auth/me`, password verification, and founder TOTP setup/enforcement.
- Admin module for institution creation, institution status updates, and Authority Grant creation.
- Founder API key workflow for one-time `client_secret` generation, safe key listing, revocation, and `POST /auth/token`.
- Global founder API key listing for all institutions with institution context and no secret material.
- Ingestion Door for student register intake, learner matching/creation, AIN assignment, enrolment creation, and draft result batch creation.
- Governance Door for batch submission, review, approval, publication, rejection, amendment, and revocation.
- Access Door for learner passport, credential list, hashed share-link creation, grant revocation, and learner verification log.
- Verification Door for share-token, credential-reference, and credential-status checks.
- Platform services for Prisma, audit writing, Authority Grant enforcement, and credential signing.
- Admin routes are restricted to `ACADID_SUPER_ADMIN`.
- Ingestion routes are restricted to AcadID admins and institution operating roles.
- Governance routes are restricted to AcadID admins, Registrars, and Exam Officers.
- Institution staff routes now enforce institution membership, so staff cannot operate on another institution by changing an ID.
- API clients now receive scoped bearer tokens and are limited to their assigned institution.
- API key rate limiting is enforced from token metadata.
- Credential publication now uses Ed25519 JOSE/JWS signatures and embeds a proof in the VC payload.
- Credential signing is prepared outside the publish transaction so database writes remain fast under load.
- Founder TOTP secrets are encrypted at rest, setup is guarded by an authenticated session, and login requires an authenticator code after TOTP is enabled.

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
- ApiKey.

### Web

The web app currently provides an operations dashboard for the first foundation workflow:

- Live Founder Console login.
- Live Founder Console authenticator-code field and security setup panel.
- Live institution list and creation form.
- Live Authority Grant creation form.
- Live API key generation with one-time secret modal.
- Live selected-institution API key list and revocation action.
- Live global API key management with search, status filters, institution context, last-used display, and revocation action.
- Gateway status panel.
- Dispute empty state.

## Validation Completed

Completed successfully:

- `npm install`
- `npm run db:generate`
- `npm run typecheck`
- `npm run build`
- `npm test`
- Local dashboard health check on `http://localhost:3000/`
- Supabase PostgreSQL configured through root `.env` using `DATABASE_URL` and `DIRECT_URL`.
- Initial Prisma migration deployed to Supabase with `npm run db:deploy`.
- Seeded AcadID Super Admin: `founder@acadid.local`.
- API health check passes at `http://localhost:4000/api/health`.
- Founder admin login succeeds against the live database.
- `npm run smoke:api`
- Founder Console returns 200 at `http://localhost:3000`.
- Founder TOTP migration deployed to Supabase.
- Supabase runtime pool settings use a transaction-safe PostgreSQL route with `connection_limit=2` and `pool_timeout=30` for local development because Prisma interactive transactions need a stable session.
- End-to-end pilot flow verified:
  - Created pilot institution `AINi-00001`.
  - Created active Authority Grant.
  - Generated a sandbox API key with `ingest:write`, `govern:write`, and `verify:read` scopes.
  - Exchanged `client_id` and one-time `client_secret` through `POST /auth/token`.
  - Ingested learner and assigned `AIN-NG-2026-0000001`.
  - Created, approved, and published a result batch.
  - Verified issued credential with cryptographic status `VALID`.

Known validation note:

- `npm install` reports dependency vulnerabilities. These need review before production. Do not run force fixes blindly.
- Docker PostgreSQL is no longer required for normal development. It remains available only as an optional local fallback.

## Local Runtime

Web app:

- Running at `http://localhost:3000`.

API app:

- Running at `http://localhost:4000` after Supabase settings are present in root `.env`, migrations are applied, and seed data exists.

## Next Engineering Steps

1. Add database-backed workflow tests for institution onboarding, ingestion, governance, publishing, and verification.
2. Add real MOU document upload/storage metadata to Authority Grants.
3. Add verifier identity capture and IP hashing to verification events.
4. Add webhook registration and delivery log models.
5. Configure stable production signing keys with `npm run crypto:keygen`.
6. Add production-grade account recovery rules for founder MFA loss.

## GitHub Status

Remote repository:

- `https://github.com/BremaChi/ACADID.git`

Already pushed:

- Monorepo foundation scaffold.
- Database migration and seed workflow.
- Web startup helper.
- Supabase PostgreSQL migration workflow.
- Prisma root `.env` helper.
- Supabase API smoke test.
- Runtime docs/status updates for active Supabase development.

## Immediate Recommendation

Add database-backed automated tests now that Supabase PostgreSQL is the active development database.

Best production-safe database path:

- Use Supabase PostgreSQL as the active cloud database during development/pilot.
- Keep Docker PostgreSQL only as optional local fallback.
- Keep PostgreSQL as the system of record for speed, integrity, and future scale.
