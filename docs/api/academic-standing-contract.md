# Academic Standing Contract

AcadID stores CGPA and classification as Data Center state, not as a frontend-only calculation.

## Data Center Entity

`AcademicStanding` is a durable rollup per learner enrolment.

Key fields:

- `learnerId`
- `institutionId`
- `enrolmentId`
- `attemptedCreditUnits`
- `earnedCreditUnits`
- `qualityPoints`
- `cgpa`
- `gradePointMax`
- `classification`
- `classificationSystem`
- `includedRecordCount`
- `periodCount`
- `latestAcademicSessionId`
- `latestPeriodLabel`
- `computedAt`

## Creation And Update Rule

Academic standing is recomputed when an approved result batch is published through:

`POST /api/govern/publish`

The recompute happens inside the same governance transaction that marks the batch and records `PUBLISHED`, creates signed result-slip credentials, and upserts `AcademicStanding`.

Products must not write `AcademicStanding` directly.

## Rollup Inputs

Only published AcademicRecords with both `gradePoint` and `creditUnits` are included.

For tertiary results, records linked to a `TERTIARY_GPA` grading rule are preferred. If historical records have grade points but no linked grading rule, AcadID still computes a defensive rollup from those records.

## Classification Defaults

AcadID currently uses a Nigerian tertiary classification profile normalized to a five-point scale:

- `>= 4.50`: First Class
- `>= 3.50`: Second Class Upper
- `>= 2.40`: Second Class Lower
- `>= 1.50`: Third Class
- `>= 1.00`: Pass
- `< 1.00`: Fail

Four-point grading scales are normalized before classification.

Institution-specific classification profiles are a future extension. Until then, institution documents should treat this as AcadID's default tertiary rollup profile.

## Student Access Endpoint

`GET /api/access/academic-standing`

Requires student auth and `access:read`.

Returns all academic standing rows for the authenticated learner, including institution and enrolment context.

## Product Boundary

Institution Portal should publish results through the Governance Door. Student App and Employer Portal should read academic standing through Gateway/API responses, never by querying Supabase directly.
