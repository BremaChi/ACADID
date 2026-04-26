# AcadID Runtime Options

AcadID should keep PostgreSQL as the production database.

PostgreSQL is the right long-term fit because it supports strong relational consistency, transactions, indexing, JSON fields for credential payloads, audit history, and proven scaling paths. Docker is not part of the production architecture; it is only a convenient way to run PostgreSQL locally during development.

## Local Development Status

This Windows machine now runs PostgreSQL through Docker in WSL/Ubuntu.

Useful details:

- Container name: `acadid-postgres`
- Database URL from Windows: `postgresql://acadid:acadid@127.0.0.1:5432/acadid`
- The default WSL user may not have Docker socket permission, so the helper script runs Docker through `wsl -u root`.
- A small WSL keepalive process helps Docker port forwarding remain available while Windows commands talk to PostgreSQL.

## Safe Options

### Option 1: WSL Docker For Local Development

Run:

```bash
scripts/start-db-wsl.cmd
$env:DATABASE_URL="postgresql://acadid:acadid@127.0.0.1:5432/acadid"
npm run db:deploy
npm run db:seed
scripts/start-api.cmd
```

This does not reduce production performance. It only gives developers a repeatable local PostgreSQL instance.

### Option 2: Local PostgreSQL On Windows

Install PostgreSQL directly on Windows, create the `acadid` database/user, then run:

```bash
$env:DATABASE_URL="postgresql://acadid:acadid@127.0.0.1:5432/acadid"
npm run db:deploy
npm run db:seed
scripts/start-api.cmd
```

This is fine for one machine, but Docker is usually easier for repeatability.

### Option 3: Managed PostgreSQL For Pilot/Production

Use a managed PostgreSQL provider such as AWS RDS, Azure Database for PostgreSQL, Google Cloud SQL, Neon, Supabase, or Render Postgres.

For AcadID pilot and production, managed PostgreSQL is the recommended route because it gives backups, monitoring, upgrades, encryption, high availability options, and future read replicas without weakening performance.

## Production Direction

For the pilot, use managed PostgreSQL in a region that satisfies AcadID's Nigeria data residency commitment and partner contracts. Keep local Docker only for development.
