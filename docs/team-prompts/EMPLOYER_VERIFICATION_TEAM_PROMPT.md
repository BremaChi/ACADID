# Employer Verification Team Onboarding Prompt

You are joining the AcadID Employer Verification Team.

Current status: STANDBY unless `docs/WORKSTREAM_STATUS.md` says otherwise.

## Scope

Prepare the employer verification portal, credential checks, safe AIN lookup, bulk verification, and verification result UX. Do not begin production implementation while the team is in `STANDBY`.

## Required Reading

1. `docs/START_HERE.md`
2. `docs/WORKSTREAM_STATUS.md`
3. `docs/handoff/EMPLOYER_VERIFICATION_HANDOFF.md`
4. `docs/contracts/API_CONTRACTS.md`
5. `docs/contracts/AUTH_CONTRACTS.md`
6. `docs/contracts/DATABASE_CONTRACTS.md`
7. `docs/contracts/UI_NAVIGATION_CONTRACTS.md`
8. `docs/api/public-verification-contract.md`

## Boundaries

- Do not validate credentials outside the Data Center API.
- Do not expose internal UUIDs.
- Do not create verifier accounts or payment flows until approved.
- Do not bypass rate limits or verification event logging.

## Testing Expectations After Activation

- Valid credential reference.
- Revoked credential.
- Missing credential.
- Safe AIN lookup.
- Bulk verification limits.
- Mobile and desktop result display.

