# Student Product Team Handoff

Status: STANDBY  
Owner area: Learner passport, credentials, access grants, record request UX  
Dependency owner: Core Platform Team  
Last updated: 2026-05-19

## Mission

Prepare the Student Product scope without implementing production features until activated. The Student Product must treat AcadID as a consent-centered learner passport backed by the Data Center API.

## Current Backend Status

Ready or partial:

- Learner records, AIN, enrolments, academic records, academic standing, credentials, and access grants exist in the database.
- `/api/access/passport`
- `/api/access/credentials`
- `/api/access/academic-standing`
- `/api/access/share-link`
- `/api/access/revoke-grant`
- `/api/access/verification-log`
- `/api/access/record-requests`
- Credential publication creates signed credential payloads.
- Record requests can be created and later fulfilled into signed credentials.
- Notification infrastructure exists, but learner notification product flows are not finalized.

## Auth Boundary

Learner authentication is not finalized. The Student Product Team must not introduce an independent learner identity model, password table, or separate user database.

Planning may cover:

- Learner account activation.
- AIN lookup security.
- Phone/email verification.
- Recovery flow.
- Device/session strategy.

Implementation must wait for Core Platform activation and contract approval.

## Product Scope After Activation

- Learner passport overview.
- Credential list and detail.
- Academic standing display.
- Share-link creation and revocation.
- Access-grant history.
- Verification viewed notifications.
- Record request submission/status.
- Profile and account security.

## What Not To Build While In STANDBY

- Production mobile/web screens.
- Learner auth implementation.
- Database schema changes.
- Direct Supabase access.
- Credential signing logic.
- Verification result logic.
- Notification provider integrations.

## Required Contracts

- `docs/contracts/API_CONTRACTS.md`
- `docs/contracts/AUTH_CONTRACTS.md`
- `docs/contracts/DATABASE_CONTRACTS.md`
- `docs/contracts/UI_NAVIGATION_CONTRACTS.md`
- `docs/api/academic-standing-contract.md`
- `docs/api/record-request-fulfillment-contract.md`

## Known Limitations

- Learner auth model is pending.
- Consent UX rules need product approval.
- Mobile push enrollment is not finalized.
- Payment UX for record requests depends on Paystack flow and product pricing decisions.

