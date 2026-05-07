# v5 Academic Setup API Contract

Owner: Engineer 1 / Data Center API  
Audience: Engineer 2 / Institution Portal  
Status: First v5 setup contract

## Purpose

These endpoints let an approved institution define its academic calendar and academic structure without hardcoding classes, subjects, faculties, departments, programmes, or courses.

The Institution Portal must call these endpoints through a human institution session. Product API keys must not perform these setup actions.

Base local API URL:

```text
http://localhost:4000/api
```

## Auth Rules

Required:

- `Authorization: Bearer <human institution JWT>`
- `academic_setup:read` for list endpoints.
- `academic_setup:write` for create/update endpoints.

Allowed human roles:

- Founder Admin
- Registrar
- Exam Officer for setup support
- Read endpoints also allow Data Entry Officer, Departmental Officer, and Read Only users with read permission.

Machine API keys are blocked from create/update academic setup actions.

## Create Academic Session

```http
POST /ingest/academic-sessions
```

Body:

```json
{
  "institutionId": "AINi-00001",
  "sessionLabel": "2026/2027",
  "periodType": "TERM",
  "periodLabel": "First Term",
  "startDate": "2026-09-01",
  "endDate": "2026-12-18",
  "status": "ACTIVE",
  "isCurrent": true
}
```

`periodType` values:

```text
TERM
SEMESTER
```

`status` values:

```text
DRAFT
ACTIVE
CLOSED
SEALED
```

If `isCurrent` is true, the API clears the current flag from other sessions for that institution.

## List Academic Sessions

```http
GET /ingest/academic-sessions?institutionId=AINi-00001
```

For non-founder staff, `institutionId` is optional and the API scopes results to the institution in the JWT.

## Update Academic Session

```http
PATCH /ingest/academic-sessions/:id
```

Body accepts partial fields:

```json
{
  "status": "CLOSED",
  "isCurrent": false
}
```

## Create Academic Structure

```http
POST /ingest/academic-structures
```

Body:

```json
{
  "institutionId": "AINi-00001",
  "parentId": "optional-parent-uuid",
  "type": "SUBJECT",
  "name": "Physics",
  "code": "PHY",
  "creditUnits": 3,
  "metadata": {
    "schoolLevel": "SS1"
  },
  "status": "ACTIVE"
}
```

`type` values:

```text
LEVEL
CLASS
ARM
STREAM
SUBJECT
FACULTY
DEPARTMENT
PROGRAMME
COURSE
```

`parentId` must belong to the same institution.

## List Academic Structures

```http
GET /ingest/academic-structures?institutionId=AINi-00001
GET /ingest/academic-structures?parentId=<uuid>
GET /ingest/academic-structures?type=COURSE
```

Use this to build the academic setup tree in the Institution Portal.

## Update Academic Structure

```http
PATCH /ingest/academic-structures/:id
```

Body accepts partial fields:

```json
{
  "name": "Physics",
  "code": "PHY",
  "status": "ACTIVE"
}
```

## Result Batch v5 Fields

`POST /ingest/results` now accepts optional v5 fields:

```json
{
  "institutionId": "AINi-00001",
  "academicSessionId": "session-uuid",
  "structureScopeId": "structure-uuid",
  "uploadMode": "MASTER_SHEET",
  "batchLabel": "SS1A First Term Master Sheet",
  "title": "SS1A First Term Results",
  "rows": []
}
```

`uploadMode` values:

```text
SUBJECT_BY_SUBJECT
MASTER_SHEET
COURSE_BASED
MANUAL_ENTRY
```

If session or structure IDs are provided, they must belong to the institution. Sealed sessions are rejected for normal result upload.

For human non-registrar users, `structureScopeId` is checked against `InstitutionUser.assignedScopes`. A staff member assigned to `{"level":"SS1","subject":"Physics"}` can work inside that matching structure path, but a request outside that scope returns `403 Forbidden`.

## Engineer 2 Notes

- Do not hardcode Nigerian academic structures.
- Build setup screens from these API responses.
- Keep destructive actions behind confirmation modals.
- Do not let browser code call Supabase directly.
- Rollover endpoints are not exposed yet; request missing needs through `docs/handoffs/engineer-1-api-requests.md`.
