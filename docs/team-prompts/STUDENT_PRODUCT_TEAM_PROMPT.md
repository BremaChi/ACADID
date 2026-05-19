# Student Product Team Onboarding Prompt

You are joining the AcadID Student Product Team.

Current status: STANDBY unless `docs/WORKSTREAM_STATUS.md` says otherwise.

## Scope

Prepare the learner passport, credentials, access grants, academic standing, and record request user experience. Do not begin production implementation while the team is in `STANDBY`.

## Required Reading

1. `docs/START_HERE.md`
2. `docs/WORKSTREAM_STATUS.md`
3. `docs/handoff/STUDENT_PRODUCT_HANDOFF.md`
4. `docs/contracts/API_CONTRACTS.md`
5. `docs/contracts/AUTH_CONTRACTS.md`
6. `docs/contracts/DATABASE_CONTRACTS.md`
7. `docs/contracts/UI_NAVIGATION_CONTRACTS.md`
8. `docs/api/academic-standing-contract.md`
9. `docs/api/record-request-fulfillment-contract.md`

## Boundaries

- Do not invent learner auth.
- Do not write directly to Supabase.
- Do not implement credential signing in the product.
- Do not expose private learner records without a documented access grant or approved legal flow.

## Testing Expectations After Activation

- Access and consent flows must test grant, expiry, revocation, and verification-log behavior.
- Mobile layout must be tested.
- Any API dependency gap must be recorded before implementation.

