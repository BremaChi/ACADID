# AcadID Workstream Status

Status: Active  
Owner: Core Platform Team  
Last updated: 2026-05-19

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
| Institution Portal Team | STANDBY | Institution onboarding and approved institution workspace | API contracts, auth contracts, institution staff/session rules, academic setup contracts | Ready to plan; implementation requires explicit activation | Must not start feature implementation until activated |
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

