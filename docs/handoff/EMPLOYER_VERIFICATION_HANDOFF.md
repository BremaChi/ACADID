# Employer Verification Team Handoff

Status: STANDBY  
Owner area: Employer verification portal, credential checks, verifier workflows  
Dependency owner: Core Platform Team  
Last updated: 2026-05-19

## Mission

Prepare the verification product without duplicating verification, billing, or credential-status logic. Verification must go through the Data Center API.

## Current Backend Status

Ready:

- Credential-reference verification.
- Share-token verification.
- Safe AIN lookup.
- Bulk verification.
- Credential status checks.
- Verification event logging.
- Verification billing event writer when configured.
- Rate limiting on public verification routes.

Current routes:

- `GET /api/verify/ref/:refnum`
- `POST /api/verify/bulk`
- `GET /api/verify/ain/:ain`
- `GET /api/verify/status/:credId`
- `GET /api/verify/:token`

## Product Scope After Activation

- Employer verification search.
- Credential reference entry.
- Bulk verification upload.
- Verification result page.
- Receipt/export flow.
- Suspicious/failure explanation.
- Future verifier account and billing UX, once approved.

## Privacy Rules

- Verifiers only see fields permitted by credential/share/access contracts.
- AIN lookup must stay safe and summary-only.
- Do not expose internal UUIDs.
- Do not expose learner private records without consented or legally permitted flow.
- Verification events must be recorded.

## What Not To Build While In STANDBY

- Production portal UI.
- Verifier account model.
- Payment checkout implementation.
- New APIs.
- Direct database reads.
- Credential validation logic outside the API.

## Required Contracts

- `docs/contracts/API_CONTRACTS.md`
- `docs/contracts/AUTH_CONTRACTS.md`
- `docs/contracts/DATABASE_CONTRACTS.md`
- `docs/api/public-verification-contract.md`

## Known Limitations

- Verifier account and payment model beyond public MVP is not finalized.
- Bulk upload UX format is not product-approved.
- Employer/developer webhooks are not yet activated.

