# AcadID Architecture Brief v5 Memory

Source reviewed:

- `C:/Users/HP/Downloads/AcadID_Architecture_Brief_v5 (1).docx`
- Document title: `ACADID Academic Identity Platform - System Architecture Brief`
- Version line in document: `Version 5.0 - April 2026`
- Reviewed on: `2026-05-07`

## Active Source Of Truth

The v5 brief supersedes v4 for the next Engineer 1 and Engineer 2 work. It keeps the four-layer architecture, Supabase PostgreSQL direction, gateway boundary, human plus machine auth model, AIN strategy, W3C VC-aligned credential direction, institution workspace isolation, and RecordRequest model.

v5 adds the academic operations layer needed for real Nigerian institutions:

- Academic Structure Engine.
- Scoped Staff Assignment.
- Modular Result Engines.
- Manual Academic Rollover.
- First-class ResultBatch operations.
- Premium Trust Identity UI layer.

AcadID remains academic identity infrastructure, not a school ERP. It must not expand into attendance, timetable, school fees, parent communication, lesson planning, or generic school management.

## Non-Negotiable v5 Principles

- Product to Gateway to Data Center is mandatory. No product writes directly to Supabase/PostgreSQL.
- Human actions must be tied to named users, not hidden product API keys.
- Every institution-scoped endpoint must derive `institution_id` from the verified token/session.
- Every academic operation must check role, assigned academic scope, and institution scope.
- UI hiding is not security. Gateway enforcement is required.
- Institutions configure academic structure. AcadID must not hardcode Nigerian classes, arms, faculties, departments, programmes, subjects, courses, credit units, grade scales, or academic levels.
- Published AcademicRecords are immutable. Corrections require versioned amendment.
- Rollover must be manual, reviewable, and audited.
- Uploaded documents stay in object storage, not PostgreSQL.
- Bulk uploads, validation, credential generation, PDFs, SMS, email, and refunds should move through background jobs as scale grows.
- No fake certification logos. Use "standards-aligned" or "designed for compliance" unless certification is real.

## Four Layers

- Layer 0: Core Data Center. Stores all core entities and remains private.
- Layer 1: Gateway. Auth, RBAC, assigned scopes, institution scope, rate limits, audit, and product/partner access.
- Layer 2: Products. Student App, Institution Portal, Employer Portal, Founder Console, Internal Ops.
- Layer 3: External Partners. WAEC, NECO, JAMB, NYSC, HR systems, and professional bodies through scoped API keys.

## Deployment Map

- `api.acadid.ng`: Data Center API, owned by Engineer 1.
- `console.acadid.ng`: Founder Console, owned by Engineer 1.
- `portal.acadid.ng`: Institution Portal, owned by Engineer 2.
- Student mobile apps: learner passport and sharing, Engineer 3.
- `verify.acadid.ng`: Employer Portal, Engineer 4.
- Exam body integrations: scoped machine API access through Data Center API.

Supabase PostgreSQL remains the active database direction. Docker PostgreSQL is optional local fallback only.

## Authentication Model

AcadID keeps two auth systems:

- Machine auth for product backends, integrations, exam bodies, and services. Machine tokens carry service label, scopes, environment, and expiry. Machine auth cannot publish results.
- Human auth for registrars, exam officers, data entry officers, departmental officers, students, employers, and founder/admin users. Human tokens carry user id, institution id where applicable, role, permissions, assigned scopes, environment, and expiry.

Security rule:

- Publishing, reviewing, rejecting, uploading, amending, inviting staff, processing record requests, and activating developer tools must be tied to a named human user.

## AIN Model

Every learner has:

- internal UUID for database joins,
- public lifelong AIN,
- AIN format direction: `AIN-NG-YYYY-0000000`.

The AIN never changes when the learner transfers, graduates, repeats, changes name, or relocates.

## Fourteen Core Entities

v5 expands from 10 to 14 core entities:

1. Learner.
2. Institution.
3. Enrolment.
4. AcademicRecord.
5. Credential.
6. VerificationEvent.
7. AccessGrant.
8. AuthorityGrant.
9. InstitutionUser.
10. RecordRequest.
11. AcademicSession.
12. AcademicStructure.
13. ResultBatch.
14. RolloverRecord.

Current repo note:

- `ResultBatch` already exists, but must be expanded to include academic session, structure scope, upload mode, validation summary, reviewer/approver, rejection reason, and v5 indexes.
- `InstitutionUser` already exists, but must add `assigned_scopes` and support departmental officer behavior.
- `AcademicSession`, `AcademicStructure`, and `RolloverRecord` are not yet implemented.

## InstitutionUser v5 Update

Add:

- `assigned_scopes` JSON array.
- Departmental Officer role.
- Scope-aware enforcement in gateway/service layer.

Examples:

```json
[{"level":"SS1","class_arm":"SS1A","subject":"Physics"}]
```

```json
[{"faculty":"Engineering","department":"Mechanical Engineering","programme":"B.Eng Mechanical Engineering","level":"300","course_code":"MEE301"}]
```

Empty assigned scopes can mean role-level scope only. Registrar normally has all institution scopes.

## AcademicSession

AcademicSession defines the institution academic calendar and prevents results from being attached to ambiguous periods.

Required direction:

- institution id,
- session label such as `2025/2026`,
- period type: term or semester,
- period label such as `First Term` or `Second Semester`,
- optional start and end dates,
- status: draft, active, closed, sealed,
- current flag,
- created by InstitutionUser.

## AcademicStructure

AcademicStructure is a flexible tree for institution-defined hierarchy.

Supported node types:

- level,
- class,
- arm,
- stream,
- subject,
- faculty,
- department,
- programme,
- course.

Fields include parent id, name, code, credit units, metadata, status, and institution id.

Institution type examples:

- Primary/secondary: session to term to class/level to arm/stream to subject.
- University: session to semester to faculty to department to programme to level to course.
- Polytechnic/college: session to semester to school/faculty to department to programme to ND/HND/NCE level to course.

## ResultBatch v5

ResultBatch is the operational container for upload, validation, review, approval, rejection, publication, amendment, and audit.

Required direction:

- institution id,
- academic session id,
- structure scope id,
- upload mode: subject-by-subject, master sheet, course-based, manual entry,
- batch label,
- status: draft, submitted, reviewed, approved, published, rejected, sealed,
- created by, reviewed by, approved by,
- record count,
- validation summary,
- rejection reason.

No direct publish from draft. Every rejection requires a written reason. Repeated rejection should be highlighted or escalated.

## RolloverRecord

RolloverRecord stores manual student progression decisions between sessions.

Decisions include:

- promoted,
- repeated,
- transferred out,
- withdrawn,
- graduated,
- suspended,
- sealed.

Rollover flow:

1. Registrar or authorized Exam Officer opens rollover.
2. Select from-session and to-session.
3. System suggests promotion map from AcademicStructure.
4. Institution reviews learners individually or in bulk.
5. System creates pending rollover records.
6. Registrar previews impact.
7. Registrar confirms.
8. New enrolment states are created/updated.
9. Previous session becomes sealed unless unresolved governance items remain.

Sealed sessions cannot receive normal uploads or edits. Reopen requires heavily audited admin escalation.

## Student Register And History

The portal must preserve where each student was during each academic period. Do not overwrite old class or level data.

Student statuses must include:

- active,
- pending rollover,
- promoted,
- repeated,
- transferred out,
- withdrawn,
- graduated,
- suspended,
- sealed.

## Modular Result Engines

AcadID must not force one result model on all institutions.

Primary/secondary engine:

- term-based,
- class/arm based,
- subject based,
- supports CA, exam, total, grade, and optional class position,
- supports subject-by-subject upload and master sheet upload.

Tertiary engine:

- semester-based,
- course-based,
- credit units,
- grade point rules,
- GPA/CGPA calculation,
- carryover handling,
- classification labels.

GPA/CGPA must be calculated from configured rules, not stored as arbitrary manual text. Overrides require audited amendment or approved configuration change.

## RecordRequest v5

RecordRequest remains separate from current-student uploads. It is for graduates or historical records.

Mandatory verification checklist:

- name,
- date of birth,
- student/matric number,
- years attended,
- class/department,
- graduation/exit year,
- proof document review.

Payment remains escrowed until Registrar publishes the requested record. Unregistered institution requests become Founder Console Invitation Leads.

## Institution Portal v5

Engineer 2 builds public site plus private institution dashboard. The portal must stay academic-records-only.

Public side:

- landing page,
- how it works,
- school types,
- pricing,
- institution directory,
- about AcadID,
- contact,
- registration flow,
- login.

Private dashboard:

- onboarding wizard,
- dashboard home,
- academic setup,
- students,
- results,
- staff management,
- record requests,
- credentials,
- analytics,
- transfers,
- disputes,
- notifications,
- developer tools,
- billing,
- settings,
- help,
- audit log,
- legal documents.

Guided onboarding wizard:

- complete institution profile,
- select academic calendar type,
- configure grading scale,
- create classes/arms or faculties/departments/programmes/courses,
- invite team,
- upload student register,
- upload first results.

Wizard must be resumable, skippable, autosaved, and return users to the last incomplete step.

## UI And Trust Direction

AcadID should feel like premium academic identity infrastructure, not a generic school portal.

Use:

- clean whitespace,
- strong typography,
- restrained color,
- premium cards,
- prominent logo,
- polished loading identity,
- authority and compliance language,
- W3C VC standards alignment,
- Nigerian data protection posture.

Do not show certification logos unless legitimately obtained.

## Founder Console v5 Updates

Engineer 1 must add Founder Console support for the new operations layer:

- academic setup completion status,
- AcademicSession list,
- active period,
- sealed sessions,
- rollover status,
- invitation leads,
- rollover escalations,
- sealed session reopen requests,
- disputed rollovers,
- emergency corrections,
- structure health,
- missing grading rules,
- missing subjects/courses,
- incomplete staff assignments,
- queue backlog,
- failed bulk uploads,
- slow validation jobs,
- storage use,
- API latency.

## Gateway Door Updates

- `/ingest`: academic structure create/update, student register upload, result batch upload, record request upload.
- `/govern`: batch submit/review/approve/publish, amendment, rollover confirm, sealed session reopen escalation.
- `/access`: student passport, record request tracking, share grants, result views.
- `/verify`: credential verification, AIN lookup, bulk verification, verification event creation.

Every endpoint must enforce:

- institution id from JWT,
- role,
- assigned scopes,
- audit event.

## Scalability Rules

Use background queues for:

- bulk uploads,
- CSV/Excel validation,
- credential generation,
- PDF generation,
- email,
- SMS,
- refund processing.

Index high-query fields:

- ain,
- institution id,
- learner id,
- enrolment id,
- academic session id,
- structure scope id,
- status,
- request id,
- batch id,
- token,
- email,
- created at.

Prepare large tables for future partitioning:

- AcademicRecord,
- VerificationEvent,
- AuditEvent,
- RecordRequest,
- ResultBatch.

Use read replicas later for verification traffic and dashboards.

## Engineer 1 Build Sequence From v5

1. Create schema for 14 entities in dependency order.
2. Keep machine auth and human auth separate.
3. Add assigned-scope enforcement.
4. Build AIN generation and duplicate matching.
5. Build AcademicStructure and AcademicSession services.
6. Build ResultBatch upload/validation/publishing workflow.
7. Build RecordRequest endpoints and invitation lead support.
8. Build RolloverRecord service and session sealing rules.
9. Keep credential signing and W3C VC-aligned payload generation.
10. Ensure append-only audit on every endpoint.
11. Update Founder Console with academic setup, rollover status, invitation leads, and institution health.
12. Create sandbox handoff tests for Engineer 2.

## Handoff Tests Before Engineer 2 Starts

Required behaviors:

- Registrar login returns user id, institution id, registrar role, and assigned scopes or all scope.
- Data Entry upload outside assigned scope returns 403.
- Data Entry upload inside assigned scope creates draft ResultBatch.
- Exam Officer publish attempt returns 403.
- Registrar publishes approved batch and creates Credential.
- Create AcademicSession.
- Create AcademicStructure.
- Manual rollover preview creates pending RolloverRecords.
- Confirm rollover creates new enrolment state and seals previous session.
- Upload to sealed session is rejected unless admin reopen is approved.
- RecordRequest creates request id and payment state.
- RecordRequest publish appears in passport and triggers payment release.
- Institution A cannot read Institution B data.
- Every major action has audit event with user id, role, institution id, and timestamp.

## Current Repo Gap Against v5

Already present:

- Supabase PostgreSQL active workflow.
- Machine auth and human institution auth.
- Founder Console foundations.
- Institution workspace isolation.
- v5 schema foundation for AcademicSession, AcademicStructure, RolloverRecord, InstitutionUser assigned scopes, expanded enrolment statuses, richer ResultBatch links, and academic record session/structure links.
- Basic ResultBatch governance.
- RecordRequest model and Founder Console review queue.
- Audit trace context foundation.
- Credential signing foundation and runbook.
- Engineer coordination docs and API request queue.
- Portal MOU/upload-ticket handoff.

Still needed:

- Add AcademicSession endpoints and Founder/Institution visibility.
- Add AcademicStructure endpoints and no-hardcoding setup workflow.
- Enforce InstitutionUser assigned scopes in gateway/service layer.
- Add Departmental Officer role behavior.
- Add ResultBatch validation summary behavior and v5 upload modes.
- Add rollover preview/confirm and sealed-session rules.
- Add GPA/CGPA/configured grading rule service.
- Add invitation leads for unregistered institutions with graduate demand.
- Add queue foundation for bulk validation, credential/PDF generation, email, SMS, and refunds.
- Add Founder Console v5 institution health, structure health, rollover escalations, invitation leads, and queue health.
- Add v5 API contracts and handoff tests for Engineer 2.
