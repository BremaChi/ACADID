# AcadID Grading Rules API Contract

AcadID treats grading as a data center control, not a UI-only setting. Institutions configure rule sets once, and result ingestion uses those rules to compute grades, grade points, quality points, and GPA summaries.

## Endpoints

All endpoints require a human institution session. Product and institution API keys may ingest results, but they cannot create or amend grading rules.

### `POST /ingest/grading-rules`

Creates a grading rule set for an institution.

Required scopes: `academic_setup:write`

Supported engines:

- `PRIMARY_SECONDARY`: score-to-grade bands for nursery, primary, and secondary school records.
- `TERTIARY_GPA`: score-to-grade bands with grade points for course-based GPA records.

Example:

```json
{
  "institutionId": "AINi-00001",
  "name": "University five point scale",
  "engine": "TERTIARY_GPA",
  "status": "ACTIVE",
  "maxScore": 100,
  "passMark": 40,
  "gradePointMax": 5,
  "scale": [
    { "minScore": 70, "maxScore": 100, "grade": "A", "gradePoint": 5, "pass": true },
    { "minScore": 60, "maxScore": 69.99, "grade": "B", "gradePoint": 4, "pass": true },
    { "minScore": 50, "maxScore": 59.99, "grade": "C", "gradePoint": 3, "pass": true },
    { "minScore": 0, "maxScore": 49.99, "grade": "F", "gradePoint": 0, "pass": false }
  ]
}
```

### `GET /ingest/grading-rules?institutionId=AINi-00001`

Lists grading rule sets visible to the current actor.

Required scopes: `academic_setup:read`

### `PATCH /ingest/grading-rules/:id`

Updates the rule set name, engine, status, scale, dates, pass mark, or grade point max.

Required scopes: `academic_setup:write`

## Result Ingestion Behavior

`POST /ingest/results` accepts an optional `gradingRuleSetId`. If supplied, AcadID verifies the rule set belongs to the institution and is not archived. If omitted, AcadID selects the active rule matching the upload mode:

- `COURSE_BASED` uses `TERTIARY_GPA`
- `SUBJECT_BY_SUBJECT`, `MASTER_SHEET`, and `MANUAL_ENTRY` use `PRIMARY_SECONDARY`

If no active rule exists, AcadID uses the MVP fallback scale and returns a `DEFAULT_GRADING_RULE_USED` warning in `validationSummary`. This keeps pilots moving, but production institutions should configure explicit rules before publication.

Uploaded row grades are treated as advisory. AcadID recomputes the grade from the configured scale and records an `UPLOADED_GRADE_OVERRIDDEN` warning when the uploaded grade differs.

For tertiary rows, include `creditUnits` to compute:

- `gradePoint`
- `qualityPoints`
- batch `gpa`
- attempted and earned credit units

The computed values are stored on `AcademicRecord` and included in W3C VC payloads when credentials are published.
