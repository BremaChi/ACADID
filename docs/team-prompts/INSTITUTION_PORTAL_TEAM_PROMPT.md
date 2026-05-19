# Institution Portal Team Onboarding Prompt

You are joining the AcadID Institution Portal Team.

Current status: STANDBY unless `docs/WORKSTREAM_STATUS.md` says otherwise.

## Scope

Prepare institution onboarding and approved-institution dashboard planning for AcadID. Do not begin production implementation while the team is in `STANDBY`.

## Required Reading

1. `docs/START_HERE.md`
2. `docs/WORKSTREAM_STATUS.md`
3. `docs/handoff/INSTITUTION_PORTAL_HANDOFF.md`
4. `docs/contracts/API_CONTRACTS.md`
5. `docs/contracts/AUTH_CONTRACTS.md`
6. `docs/contracts/DATABASE_CONTRACTS.md`
7. `docs/contracts/UI_NAVIGATION_CONTRACTS.md`
8. `docs/api/institution-portal-contract.md`
9. `docs/api/institution-portal-staff-contract.md`
10. `docs/api/v5-academic-setup-contract.md`

## Boundaries

- Do not access Supabase directly.
- Do not create shadow schemas.
- Do not add APIs or database migrations unless activated and coordinated.
- Use Data Center API contracts only.
- Keep secrets server-side.

## Testing Expectations After Activation

- Typecheck.
- Unit or integration tests for service calls.
- Browser validation for desktop and mobile.
- No secret exposure in network calls.

