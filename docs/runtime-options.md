# AcadID Runtime Options

AcadID now uses Supabase PostgreSQL as the active development database.

The backend API architecture stays the same: NestJS and Prisma connect directly to PostgreSQL. Do not rewrite the app to use the Supabase frontend SDK for core AcadID data flows.

## Active Database

Use the root `.env` file:

```bash
DATABASE_URL=...
DIRECT_URL=...
```

- `DATABASE_URL` is the runtime connection used by the API and Prisma Client.
- `DIRECT_URL` is the direct database connection used by Prisma migrations.
- For local Supabase development, `DATABASE_URL` should use a PostgreSQL route that supports Prisma interactive transactions. The direct database host is the safest default on this machine; a session pooler is acceptable only if it is reachable and preserves stable sessions. Do not use transaction pooling for the API runtime because ingestion, governance, and credential issuance need interactive transactions.
- If the Supabase direct host is unavailable from a local network, use the Supabase session-pooler migration URL on port `5432` with `sslmode=require` until a direct IPv4 route is available.
- Never commit `.env` or paste database passwords into documentation, logs, or GitHub.

## Normal Development Flow

From the repo root:

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev --workspace @acadid/api
npm run dev --workspace @acadid/web
npm run smoke:api
```

Then verify:

```bash
http://localhost:4000/api/health
http://localhost:3000
```

On Windows, `scripts/start-api.cmd` and `scripts/start-web.cmd` start those same dev servers in minimized terminals. The API dev command uses the AcadID runner in `apps/api/scripts/dev.mjs`, which keeps Nest watch compilation but starts the server from `apps/api/dist/apps/api/src/main.js`.

`npm run db:deploy` first tries Prisma's normal migration engine. If the local machine cannot reach Supabase through the migration connection, it falls back to the Prisma Client migration runner so the checked-in SQL migration is still applied safely.

## Optional Local Fallback

`docker-compose.yml` and `scripts/start-db-wsl.cmd` remain available only as a local fallback. They are not required for normal development now that Supabase is the active database.

Use the Docker fallback only when Supabase is unavailable or when testing a completely isolated local database.

## Production Direction

For pilot and production, keep PostgreSQL as the system of record. Supabase can serve the early cloud PostgreSQL role while AcadID validates pilot workflows. Before production launch, confirm region, backup, encryption, connection pooling, audit, and data residency commitments match AcadID's Nigeria-focused contracts.
