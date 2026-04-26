# ADR 0001: Foundation Stack

## Status

Accepted for MVP scaffold.

## Decision

Use a TypeScript monorepo with:

- NestJS API.
- Next.js web portal.
- PostgreSQL.
- Prisma.
- Shared packages for domain types, database, crypto, and audit helpers.

## Reason

AcadID has role-heavy workflows, audit requirements, institutional boundaries, and long-lived data contracts. A typed monorepo gives the first engineering team one place to evolve API, web, database, and shared domain rules without losing consistency.
