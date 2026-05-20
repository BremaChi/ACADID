# AcadID Workstream Status

Status: Active  
Owner: Core Platform Team  
Last updated: 2026-05-20

## Status Definitions

- `STANDBY`: Documentation, dependency review, contract review, planning, and blocker identification only.
- `ACTIVE DEVELOPMENT`: Implementation is authorized inside the workstream scope.
- `REVIEW`: Implementation is complete enough for integration/security/product review.
- `BLOCKED`: Work cannot continue until a named dependency is resolved.
- `RELEASE READY`: Tested and ready for release packaging or deployment.

## Mandatory STANDBY Rules

If a team is in `STANDBY`, they must only:

- Read documentation.
- Review contracts.
- Understand dependencies.
- Prepare implementation plans.
- Identify blockers.
- Wait for activation.

They must not:

- Create production features.
- Modify shared infrastructure.
- Introduce schema changes.
- Create UI implementations.
- Add APIs.
- Change contracts.

## Current Workstreams

| Team | Status | Owner area | Dependencies | Activation readiness | Blockers |
| --- | --- | --- | --- | --- | --- |
| Core Platform Team | ACTIVE DEVELOPMENT | Data Center, Gateway API, Founder Console, auth, database, queue, workers, contracts | Supabase, Prisma, NestJS, Next.js, shared packages | Active | Pending production deployment hardening and planned framework upgrade follow-through |
| Institution Portal Team | ACTIVE DEVELOPMENT | Institution onboarding and approved institution workspace | API contracts, auth contracts, institution staff/session rules, academic setup contracts, founder-provided sandbox product API credentials | Activated 2026-05-20 for Institution Portal build using Data Center APIs only | Production credentials and production deployment are not authorized yet |
| Student Product Team | STANDBY | Learner passport, credentials, access grants, record request UX | Learner auth decision, access API contract, notification contract | Planning only | Learner auth model is not finalized |
| Employer Verification Team | STANDBY | Verification portal, credential checks, bulk verification UX | Public verification API, billing/rate-limit policy, verifier account decision | Planning only | Verifier account/payment model beyond MVP is not finalized |
| QA/Security/Release Team | STANDBY | Test strategy, security checks, release readiness, CI/release gates | All contracts, SECURITY_NOTES, SECURITY_UPGRADE_PLAN, smoke tests | Planning only | Release environment and production secrets are not configured |

## Activation Rule

A workstream moves out of `STANDBY` only when the Founder or Core Platform Team updates this file and records:

- Activation date.
- Authorized scope.
- Protected files.
- Required contract documents.
- Test requirements.
- Review owner.

## Activation Records

### Institution Portal Team

- Activation date: 2026-05-20.
- Authorized scope: Build the Institution Portal product against existing Data Center API contracts, beginning with public institution onboarding and related approved-institution workspace planning.
- Credentials: Use the founder-provided **Sandbox Institution Portal product API key** only. The `client_secret` must live in the Institution Portal backend environment and must not be committed, logged, or exposed to browser JavaScript.
- Protected files: Shared contracts, Prisma schema, API controllers/services, shared auth, queue, worker, webhook, and Founder Console files require Core Platform Team review before changes.
- Required contract documents: `docs/contracts/API_CONTRACTS.md`, `docs/contracts/AUTH_CONTRACTS.md`, `docs/contracts/DATABASE_CONTRACTS.md`, `docs/contracts/WEBHOOK_CONTRACTS.md`, and `docs/contracts/UI_NAVIGATION_CONTRACTS.md`.
- Test requirements: Typecheck, focused unit/integration tests for portal API service calls, browser validation for desktop/mobile, and no secret exposure in frontend bundles or network responses.
- Review owner: Core Platform Team.
