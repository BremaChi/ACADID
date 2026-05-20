# AcadID Auth Contracts

Status: Active  
Owner: Core Platform Team  
Last updated: 2026-05-19

## Auth Actors

| Actor | Auth method | Token kind | Notes |
| --- | --- | --- | --- |
| Founder Admin | Email/password plus TOTP or recovery code when enabled | `USER` with super-admin role | Founder Console only |
| Institution staff | Registrar invite acceptance, then email/password | `USER` with institution workspace claims | Human dashboard actions |
| Product backend | Product API key exchange | `API_CLIENT` | Server-side only |
| Institution API client | Approved developer access, then API key exchange | `API_CLIENT` | Machine-to-machine integration |
| Learner | Future learner auth | TBD | Student Product Team must not invent a conflicting model |
| Verifier | Public verification or future verifier account | Public/API client depending on flow | Employer Verification Team must follow verification contracts |

## Founder Sessions

Founder login uses:

```http
POST /api/auth/login
```

Founder-sensitive controls require:

- `ACADID_SUPER_ADMIN` role.
- Strong password.
- TOTP when enabled.
- Recovery codes only as one-time backup login.

Founder TOTP and recovery routes are restricted to authenticated founder sessions.

## Institution Staff Sessions

Institution staff sessions are human sessions. Token claims include:

- `kind: "USER"`
- `institutionUuid`
- `institutionId`
- `institutionUserId`
- `role`
- `permissions`
- `assignedScopes`

Institution staff actions must derive the institution from token claims. Product UIs must not allow a user-selected institution ID to override the workspace.

## Product And Institution API Clients

Machine clients exchange `client_id` and one-time `client_secret` through:

```http
POST /api/auth/token
```

Rules:

- Store `client_secret` only in a backend environment.
- Never expose secrets to browser JavaScript.
- Never log secrets.
- Product keys are for internal products such as Institution Portal, Student Mobile App, Employer Verification Portal, and Exam Body Connector.
- Institution Portal Team must use the founder-provided Sandbox Institution Portal product key during active development.
- Production product keys are separate credentials and require release approval before use.
- Institution live-result keys require approved Developer Access.
- API keys are scope-limited and rate-limited.

## Permission Rules

Common permissions:

- `institution:apply`
- `academic_setup:read`
- `academic_setup:write`
- `students:read`
- `students:write`
- `ingest:write`
- `results:read`
- `results:draft`
- `govern:review`
- `govern:write`
- `govern:publish`
- `record_requests:verify`
- `record_requests:upload`
- `staff:manage`
- `verify:read`
- `access:read`
- `identity:write`
- `webhook:manage`

Machine keys must not perform human-only governance actions unless the API contract explicitly allows that route.

## Workspace Isolation

- Institution staff can only act inside their active institution membership.
- Suspended staff cannot operate.
- Assigned academic scopes limit non-Registrar actions.
- Founder Admin can operate across institutions through admin routes.
- Product backends cannot bypass Authority Grants, Access Grants, audit logging, or rate limits.

## Pending Decisions

- Learner authentication model for Student Product Team.
- Employer/verifier account model beyond public verification MVP.
- Production TOTP enrollment policy for all privileged institution roles.
