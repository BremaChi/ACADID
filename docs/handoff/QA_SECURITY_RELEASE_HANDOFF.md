# QA/Security/Release Team Handoff

Status: STANDBY  
Owner area: Test strategy, security verification, release readiness, deployment checks  
Dependency owner: Core Platform Team  
Last updated: 2026-05-19

## Mission

Prepare release quality controls before production deployment. This workstream may review, plan, and identify risks while in `STANDBY`, but must not alter production features or shared infrastructure until activated.

## Current Validation Baseline

Known baseline commands:

- `npm run typecheck`
- `npm test`
- `npm run smoke:api`
- `npm run worker:once`
- `npm run db:deploy` when migrations change

Security docs:

- `SECURITY_NOTES.md`
- `SECURITY_UPGRADE_PLAN.md`
- `docs/runbooks/credential-signing-keys.md`
- `docs/runbooks/api-key-rotation.md`
- `docs/runbooks/emergency-lockdown.md`
- `docs/runbooks/founder-recovery.md`
- `docs/runbooks/production-database-scaling.md`

## QA Scope After Activation

- Regression test plan.
- Browser test matrix.
- API smoke test expansion.
- Worker/queue reliability checks.
- Security control checklist.
- Release checklist.
- Rollback checklist.
- Production readiness evidence.

## Security Focus Areas

- Auth and MFA.
- API key secret handling.
- Rate limiting.
- Idempotency.
- Audit logs.
- Credential signing keys.
- Webhook signatures.
- Data residency assumptions.
- No training or monetisation of student data.
- Direct database access prevention for product teams.

## What Not To Do While In STANDBY

- Modify production code.
- Change schema.
- Change contracts.
- Add release automation that changes deployment behavior.
- Rotate secrets.
- Run destructive migration operations.

## Known Risks

- Production deployment target is pending.
- Framework upgrade follow-through must be completed carefully.
- Production signing keys and provider secrets are not configured in this repository.
- Load testing has not yet been performed at national-scale assumptions.

