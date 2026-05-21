# AcadID UI Navigation Contracts

Status: Active  
Owner: Core Platform Team for shared shell; product teams for product screens  
Last updated: 2026-05-21

## Global UI Rules

Follow root `AGENTS.md` and the ACAD.ID styling system:

- Mobile-first.
- Soft neutral background.
- White cards.
- Clear spacing.
- Navy/blue brand accents.
- No dark/scary backgrounds.
- No random gradients.
- No cluttered hero banners.
- Every page must have a clear title, subtitle, action button, loading state, empty state, error state, and success feedback where relevant.

## Founder Console Navigation

The Founder Console is for:

- Platform oversight.
- Institution approval.
- API key control.
- Risk monitoring.
- System health.
- Revenue visibility.
- Escalation management.

It is not for daily school operations.

Current sidebar groups:

- Main: Overview, Institutions, Academic Operations, Institution Applications.
- Access & Integrations: API Keys, Developer Access Requests, Webhooks.
- Operations: Record Requests, Disputes, Verification Logs, Background Jobs.
- Business: Revenue, Billing, Reports.
- System: System Health, Audit Logs, Security, Settings.

Founder Console workspace routes support hash navigation such as:

- `#institutions`
- `#api-keys`
- `#background-jobs`
- `#system-health`

## Product Navigation Boundaries

Institution Portal Team owns:

- Public institution onboarding.
- Approved institution workspace/dashboard.
- Institution staff operational screens.

Institution Portal must use one shared portal shell with role-focused workspaces. Registrar, Exam Officer, Data Entry Officer, Scoped Academic Officer, and Read Only users should have different landing dashboards, navigation emphasis, primary actions, and empty states based on `role`, `permissions`, `assignedScopes`, and `institutionCategory`.

The API controls authorization and permitted data. The frontend controls layout and role-specific UX. Do not build separate apps per worker type, and do not make one overloaded dashboard that shows every module to every institution worker.

Scoped Academic Officer is the contract term for limited academic staff. UI labels may adapt by institution category:

- Nursery/Primary: Class Teacher or Class Officer.
- Secondary/combined schools: Subject Officer, Class/Form Officer, or HOD.
- Universities: Departmental Officer, Programme Officer, Course Officer, or Faculty Officer.
- Polytechnics/Colleges: Department Officer, Programme Officer, or Course Officer.
- Exam Bodies: Exam Series Officer, Paper Officer, or Result Officer.

Student Product Team owns:

- Learner passport.
- Credential viewing.
- Share/access grant flows.
- Record request submission/status.

Employer Verification Team owns:

- Credential-reference verification.
- AIN safe lookup where approved.
- Bulk verification.
- Verification result and receipt UX.

QA/Security/Release Team owns:

- Test plans.
- Security review surfaces.
- Release checklists.
- Manual verification matrices.

## Shared UI Contract Rules

- Do not duplicate business logic in frontend code.
- Validation should mirror backend rules but backend remains authoritative.
- Shared route or navigation changes require this document to be updated.
- Product teams in `STANDBY` must not create UI implementations.
- Mobile layouts must not rely on wide tables only.
