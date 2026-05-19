# Core Platform Team Handoff

Status: ACTIVE DEVELOPMENT  
Owner area: Core Data Center, Gateway API, Founder Console, auth, database, queues, workers, contracts  
Last updated: 2026-05-19

## Mission

Maintain AcadID as reliable national-scale academic identity infrastructure. The Core Platform Team owns shared systems that every product workstream depends on.

## Current Backend Status

Implemented:

- Supabase PostgreSQL runtime through `DATABASE_URL` and `DIRECT_URL`.
- Prisma schema and migrations for v5 academic operations, record requests, queues, webhooks, notifications, rate limits, idempotency, worker heartbeats, transfers, rollovers, academic standing, and production indexes.
- NestJS Gateway API with `/auth`, `/admin`, `/portal`, `/ingest`, `/govern`, `/access`, `/verify`, `/jobs`, and `/webhooks`.
- Founder Console connected to live backend data.
- Ed25519 JOSE/JWS credential signing foundation.
- Background job worker with retry, dead-letter, webhook, notification, Paystack, cleanup, and bulk-processing support.
- Structured logging, audit events, health checks, safe caching, rate limiting, idempotency, and webhook signing.

## Core Responsibilities

- Keep shared contracts current.
- Maintain backward-compatible API behavior wherever possible.
- Own database schema and migrations.
- Own auth, scopes, institution workspace isolation, and role enforcement.
- Own queues, workers, webhooks, idempotency, rate limits, and audit logging.
- Review shared infrastructure changes from product teams.
- Keep Founder Console focused on platform oversight.

## Protected Files

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/**`
- `apps/api/src/modules/auth/**`
- `apps/api/src/modules/platform/**`
- `apps/api/src/modules/gateway/**`
- `apps/api/src/modules/jobs/**`
- `packages/shared/src/**`
- `packages/crypto/src/**`
- `docs/contracts/**`

## Current Priorities

1. Keep local and Supabase runtime stable.
2. Prepare production deployment path for API, workers, web, and secrets.
3. Continue security hardening from `SECURITY_NOTES.md`.
4. Execute framework upgrade follow-through from `SECURITY_UPGRADE_PLAN.md`.
5. Maintain workstream contracts before product teams activate.

## Known Limitations

- Production deployment target is not finalized.
- Learner auth model is not finalized.
- Employer/verifier account and payment model beyond MVP is not finalized.
- Some provider integrations are configured as dry-run unless real secrets are supplied.
- Credential signing reports degraded in local development until stable production keys are configured.

## Required Validation

Before handoff:

- `npm run typecheck`
- `npm test`
- `npm run smoke:api`
- `npm run worker:once` when queue/worker behavior changes
- Browser check for Founder Console when UI changes

