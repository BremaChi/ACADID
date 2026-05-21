# Institution Portal Staff Contract

Owner: Core Platform Team Data Center / Gateway.

Consumer: Institution Portal Team.

These routes let a Registrar manage institution staff and assigned academic scopes without direct Supabase access. All routes require a human institution session with `staff:manage`; machine API keys are rejected.

## Routes

Base URL: `/api/portal`

### `GET /staff`

Returns staff for the authenticated user's institution only.

Response excludes invite token hashes and secret material.

### `GET /staff/scope-options`

Returns active AcademicStructure nodes and recent/current AcademicSession rows for the authenticated institution.

Use these records to build scope pickers for classes, arms, subjects, departments, programmes, and courses.

The UI must treat assigned scope as category-aware. Secondary schools may scope staff by class, arm, level, subject, or HOD-style group; tertiary institutions may scope by faculty, department, programme, level, course, or credit-bearing unit; exam bodies may scope by exam series, subject, paper, or release workflow.

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

`DEPARTMENTAL_OFFICER` is the current backend compatibility enum for the product concept named **Scoped Academic Officer**. Do not display it blindly for all institutions.

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

## Role-Focused UI Guidance

The Institution Portal should render one portal shell with role-focused dashboards:

- Registrar: institution control, staff, setup, publishing, amendments, record requests, developer access.
- Exam Officer: review queues, validation issues, academic exceptions, record request verification.
- Data Entry Officer: upload workspace, draft batches, validation errors, background job progress.
- Scoped Academic Officer: only assigned scopes and actions; display labels adapt by institution category.
- Read Only: permitted reports and records without mutation actions.

Recommended display labels for `DEPARTMENTAL_OFFICER` / Scoped Academic Officer:

- Nursery/Primary: Class Teacher or Class Officer.
- Secondary/combined schools: Subject Officer, Class/Form Officer, or HOD.
- Universities: Departmental Officer, Programme Officer, Course Officer, or Faculty Officer.
- Polytechnics/Colleges: Department Officer, Programme Officer, ND/HND/NCE Level Officer, or Course Officer.
- Exam Bodies: Exam Series Officer, Paper Officer, or Result Officer.

The backend remains authoritative. UI labels and hidden buttons do not grant or remove permissions.

## Security Rules

- Institution is derived from the JWT, never from request body.
- Machine/API-key tokens cannot manage staff.
- Every update writes `portal.institution_user.update` to the audit log.
- Invite actions reuse the central human invitation flow and write `institution_user.invite`.
- `assignedScopes` is stored as JSON and later enforced by Gateway academic operations.
