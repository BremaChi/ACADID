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

## Testing Expectations After Activation

- Typecheck.
- Unit or integration tests for service calls.
- Browser validation for desktop and mobile.
- No secret exposure in network calls.
