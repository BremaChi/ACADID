# AcadID Engineering Coordination

Owner: Engineer 1 / Data Center API  
Audience: Engineer 2, Engineer 3, Engineer 4, Founder  
Status: Active coordination protocol  
Last updated: 2026-05-06

## Purpose

AcadID must stay one platform, not separate products with separate databases. Every product engineer should build against the Data Center API and record missing backend needs in this repo before creating local workarounds.

This document is the communication bridge between product engineers and Engineer 1.

## Source Of Truth

Use these files before changing product behavior:

- `PROJECT_STATUS.md` for what exists and what is next.
- `docs/architecture-brief-v4-memory.md` for active architecture direction.
- `docs/api/*.md` for API contracts.
- `docs/handoffs/*.md` for product handoff instructions.
- Prisma schema and migrations for actual Data Center persistence.

Do not treat a product UI mockup as permission to create new data roots. If the API contract is missing, request it here first.

## Engineer Roles

Engineer 1 owns:

- Data Center schema.
- Gateway API routes.
- Authentication, authorization, scopes, and rate limits.
- Audit events.
- Credential signing and verification.
- Founder Console control workflows.
- Shared contracts used by other products.

Engineer 2 owns:

- Institution Portal product UI/backend.
- Institution onboarding form flow.
- Document upload UI.
- MOU acceptance UI.
- Pending-review user experience.

Engineer 3 and Engineer 4 will follow the same rule: product code calls the Data Center API, not Supabase directly.

## Request Flow

When another engineer needs something from Engineer 1:

1. Check the current API contract in `docs/api`.
2. If the needed route or field is missing, add a request to `docs/handoffs/engineer-1-api-requests.md`.
3. Include product, user story, fields, expected response, permissions, and urgency.
4. Do not create a shadow table, local Supabase schema, or product-only credential model.
5. Engineer 1 updates the schema/API contract or rejects the request with a reason.

## Required Request Shape

Every request should include:

- Product: Institution Portal, Student App, Employer Portal, Exam Body Connector, or Founder Console.
- User story: what the user is trying to do.
- Proposed endpoint or event.
- Required fields.
- Actor and permission scope.
- Audit event needed.
- Data residency or privacy concern.
- Blocking level: `BLOCKED`, `NEEDED_SOON`, or `NICE_TO_HAVE`.

## Contract Change Rules

Use additive changes by default:

- Add optional fields before making fields required.
- Add new endpoints instead of changing working payloads.
- Keep old enum values working unless a migration plan exists.
- Never expose internal UUIDs as public identity.
- Never return API secrets after first display.
- Never bypass Authority Grants, Access Grants, or audit logging.

Breaking changes require:

- Updated `docs/api` contract.
- Updated shared schema.
- Migration plan.
- Test update.
- Founder-visible note in `PROJECT_STATUS.md`.

## How Engineer 1 Reviews Product Changes

When Engineer 2 finishes a feature, Engineer 1 should review:

- Does it call the documented Data Center API?
- Does it keep secrets server-side?
- Does it avoid direct Supabase access?
- Does it use the correct scopes?
- Does it handle loading, empty, error, and success states?
- Does it need a new audit event?
- Does it preserve Nigerian data residency assumptions?

## Practical Working Agreement

If Engineer 2 is blocked, they should leave one clear request in `engineer-1-api-requests.md` and continue with mocked UI only behind a service placeholder.

If Engineer 1 changes a contract, Engineer 1 must update:

- the API code,
- the shared schema,
- the API contract document,
- the product handoff note,
- tests or smoke scripts,
- `PROJECT_STATUS.md`.

