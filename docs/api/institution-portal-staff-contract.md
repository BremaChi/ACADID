# Institution Portal Staff Contract

Owner: Engineer 1 Data Center / Gateway.

Consumer: Engineer 2 Institution Portal.

These routes let a Registrar manage institution staff and assigned academic scopes without direct Supabase access. All routes require a human institution session with `staff:manage`; machine API keys are rejected.

## Routes

Base URL: `/api/portal`

### `GET /staff`

Returns staff for the authenticated user's institution only.

Response excludes invite token hashes and secret material.

### `GET /staff/scope-options`

Returns active AcademicStructure nodes and recent/current AcademicSession rows for the authenticated institution.

Use these records to build scope pickers for classes, arms, subjects, departments, programmes, and courses.

### `POST /staff/invite`

Creates or refreshes a staff invitation for the authenticated institution.

Body:

```json
{
  "fullName": "Data Officer",
  "email": "data@example.edu.ng",
  "phone": "+2348000000000",
  "role": "DATA_ENTRY_OFFICER",
  "permissions": ["ingest:write", "results:draft"],
  "assignedScopes": [
    {
      "level": "SS1",
      "subject": "Mathematics"
    }
  ]
}
```

Allowed roles:

- `EXAM_OFFICER`
- `DATA_ENTRY_OFFICER`
- `DEPARTMENTAL_OFFICER`
- `READ_ONLY`

Registrar-to-Registrar invitations must remain founder-approved.

### `PATCH /staff/:id`

Updates a non-Registrar staff membership inside the authenticated institution.

Body can include:

```json
{
  "role": "DEPARTMENTAL_OFFICER",
  "status": "SUSPENDED",
  "permissions": ["academic_setup:read", "results:read"],
  "assignedScopes": [
    {
      "department": "Mechanical Engineering",
      "course_code": "MEE301"
    }
  ],
  "twoFactorRequired": true
}
```

Allowed statuses:

- `INVITED`
- `ACTIVE`
- `SUSPENDED`
- `DISABLED`

Registrar membership changes remain Founder Console only.

## Security Rules

- Institution is derived from the JWT, never from request body.
- Machine/API-key tokens cannot manage staff.
- Every update writes `portal.institution_user.update` to the audit log.
- Invite actions reuse the central human invitation flow and write `institution_user.invite`.
- `assignedScopes` is stored as JSON and later enforced by Gateway academic operations.

