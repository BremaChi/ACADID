# Institution Portal Type-Aware Design Brief

Status: Active contract guidance
Owner: Core Platform Team
Audience: Institution Portal Team
Last updated: 2026-05-21

## Purpose

AcadID supports one Institution Portal. The portal must adapt onboarding and setup guidance to each approved institution category without creating separate apps or product-local academic schemas.

## Required Category Field

Application submissions must send `institutionCategory`.

Supported values:

- `NURSERY`
- `PRIMARY`
- `SECONDARY`
- `NURSERY_PRIMARY`
- `PRIMARY_SECONDARY`
- `NURSERY_PRIMARY_SECONDARY`
- `FEDERAL_UNIVERSITY`
- `STATE_UNIVERSITY`
- `PRIVATE_UNIVERSITY`
- `POLYTECHNIC`
- `COLLEGE_OF_EDUCATION`
- `EXAM_BODY`
- `OTHER_ACCREDITED`

`Institution.type` remains a broad grouping for compatibility only: `PRIMARY`, `SECONDARY`, `TERTIARY`, or `EXAM_BODY`.

## Setup Paths

| Category group | Guided setup path | Final source of truth |
| --- | --- | --- |
| Nursery and Primary | Terms, levels/classes, arms, subjects | `AcademicSession`, `AcademicStructure`, `GradingRuleSet` |
| Secondary and combined schools | JSS/SSS levels, terms, arms, subjects | `AcademicSession`, `AcademicStructure`, `GradingRuleSet` |
| Universities | Semesters, faculties, departments, programmes, levels, courses, credit units | `AcademicSession`, `AcademicStructure`, `GradingRuleSet` |
| Polytechnics | Semesters, schools/faculties, departments, programmes, ND/HND levels, courses | `AcademicSession`, `AcademicStructure`, `GradingRuleSet` |
| Colleges of Education | Semesters, schools, departments, NCE levels, courses | `AcademicSession`, `AcademicStructure`, `GradingRuleSet` |
| Exam Bodies | Exam series, candidates, subjects/papers, result release | `AcademicSession`, `AcademicStructure`, `GradingRuleSet` |
| Other Accredited | Custom setup wizard with Core Platform defaults | `AcademicSession`, `AcademicStructure`, `GradingRuleSet` |

## Design Rules

- Use one portal navigation system.
- Branch onboarding copy, setup wizard steps, empty states, and validation prompts by `institutionCategory`.
- Treat academic templates as guided starting points only.
- Let the institution configure its final structure through Data Center APIs.
- Do not hardcode a final list of classes, departments, programmes, subjects, courses, grading rules, or sessions in the portal.
- Do not read Supabase directly.
- Do not duplicate credential signing, verification, publication, or governance logic.

## API Response Expectations

Founder/Admin and portal application responses may include:

- `institutionCategory`
- `broadType`
- `academicTemplate.code`
- `academicTemplate.label`
- `academicTemplate.structureHint`

Use these fields to render setup recommendations. If a field is missing in an older response, fall back to `OTHER_ACCREDITED` and ask Core Platform to confirm the contract before building around it.

## Handoff Note

The Sandbox Institution Portal product API key is enough for onboarding integration work. Production credentials are not authorized until release approval.
