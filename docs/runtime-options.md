# AcadID Runtime Options

AcadID should keep PostgreSQL as the production database.

PostgreSQL is the right long-term fit because it supports strong relational consistency, transactions, indexing, JSON fields for credential payloads, audit history, and proven scaling paths. Docker is not part of the production architecture; it is only a convenient way to run PostgreSQL locally during development.

## Current Local Blocker

This Windows machine does not currently have:

- Docker Desktop
- `psql`
- A local PostgreSQL Windows service

Because of that, local database migration and end-to-end API runtime testing cannot run yet.

## Safe Options

### Option 1: Docker Desktop For Local Development

Install Docker Desktop, then run:

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
scripts/start-api.cmd
```

This does not reduce production performance. It only gives developers a repeatable local PostgreSQL instance.

### Option 2: Local PostgreSQL On Windows

Install PostgreSQL directly on Windows, create the `acadid` database/user, then run:

```bash
npm run db:migrate
npm run db:seed
scripts/start-api.cmd
```

This is fine for one machine, but Docker is usually easier for repeatability.

### Option 3: Managed PostgreSQL For Pilot/Production

Use a managed PostgreSQL provider such as AWS RDS, Azure Database for PostgreSQL, Google Cloud SQL, Neon, Supabase, or Render Postgres.

For AcadID pilot and production, managed PostgreSQL is the recommended route because it gives backups, monitoring, upgrades, encryption, high availability options, and future read replicas without weakening performance.

## Production Direction

For the pilot, use managed PostgreSQL in a region that satisfies AcadID's Nigeria data residency commitment and partner contracts. Keep local Docker only for development.
