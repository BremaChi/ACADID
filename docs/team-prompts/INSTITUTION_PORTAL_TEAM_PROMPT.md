# Institution Portal Team Onboarding Prompt

You are joining the AcadID Institution Portal Team.

Current status: ACTIVE DEVELOPMENT for the scope recorded in `docs/WORKSTREAM_STATUS.md`.

## Scope

Build institution onboarding and approved-institution workspace surfaces for AcadID using the existing Data Center API contracts. Start with the Sandbox environment and do not introduce production credentials until release approval.

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
11. `docs/design/INSTITUTION_PORTAL_TYPE_AWARE_BRIEF.md`
12. `docs/coordination/CORE_PLATFORM_REQUESTS.md`

## Boundaries

- Do not access Supabase directly.
- Do not create shadow schemas.
- Do not add APIs or database migrations unless coordinated through the relevant contract documents first.
- Use Data Center API contracts only.
- Keep secrets server-side.
- Use the founder-provided **Sandbox Institution Portal product API key** for backend-to-Data-Center calls.
- Store `client_id` and `client_secret` in the Institution Portal backend environment only.
- Never commit credentials, access tokens, or links to secure credential documents.
- Never call `/api/auth/token` from browser/client-side code.
- Build one Institution Portal with category-aware setup paths for nursery, primary, secondary, combined schools, universities, polytechnics, colleges, exam bodies, and other accredited institutions.
- Use `institutionCategory` for detailed setup guidance. Do not use broad `Institution.type` as the detailed product flow switch.
- Do not hardcode final academic structures. Use templates as starting guidance only; final structures must come from Data Center academic setup APIs.

## Sandbox Auth Setup

Expected backend environment shape:

```env
ACADID_API_BASE_URL=http://localhost:4000/api
ACADID_CLIENT_ID=founder-provided-sandbox-client-id
ACADID_CLIENT_SECRET=founder-provided-sandbox-client-secret
```

The backend exchanges credentials through:

```http
POST /api/auth/token
```

Use the resulting token only on the server when calling the allowed portal endpoints.

## Asking Core Platform For Help

If the portal build needs a backend change, new API behavior, schema support, shared auth decision, worker/queue support, webhook behavior, or Founder Console control, add a request to `docs/coordination/CORE_PLATFORM_REQUESTS.md`.

Do not create private product-local workarounds for Core Platform behavior.

## Testing Expectations After Activation

- Typecheck.
- Unit or integration tests for service calls.
- Browser validation for desktop and mobile.
- No secret exposure in network calls.
