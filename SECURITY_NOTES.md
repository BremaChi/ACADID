# AcadID Security Notes

Last reviewed: 2026-05-08

## Dependency Hardening Policy

Do not run `npm audit fix --force` blindly. Major framework upgrades must be planned, isolated, and tested because AcadID depends on NestJS routing/auth guards, Next.js dashboard behavior, Prisma build output, and worker entrypoints.

This review used:

```text
npm audit --omit=dev --json
npm ls @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config next file-type lodash multer postcss --all
```

`npm outdated --all --json` was attempted but the registry request failed with `ECONNRESET`, so package availability was checked with targeted package queries where needed.

## Direct Dependencies We Control

| Package | Installed | Severity | Source | Status |
| --- | ---: | --- | --- | --- |
| `@nestjs/common` | `10.4.22` | Moderate | pulls vulnerable `file-type@20.4.1` | Requires Nest framework upgrade or upstream Nest patch beyond current installed line. |
| `@nestjs/config` | `3.3.0` | Moderate/High via `lodash@4.17.21` | direct dependency | npm audit recommends `@nestjs/config@4.0.4`, a major upgrade. Defer to Nest upgrade task. |
| `@nestjs/core` | `10.4.22` | Moderate | direct advisory plus platform-express chain | npm audit recommends `@nestjs/core@11.1.19`, a major upgrade. |
| `@nestjs/platform-express` | `10.4.22` | High | pulls vulnerable `multer@2.0.2` and depends on core | npm audit recommends `@nestjs/platform-express@11.1.19`, a major upgrade. |
| `next` | `14.2.35` | High/Moderate | multiple Next advisories plus bundled `postcss@8.4.31` | npm audit recommends `next@16.2.6`, a major upgrade. |

## Transitive Dependencies

| Package | Installed | Pulled By | Severity | Notes |
| --- | ---: | --- | --- | --- |
| `file-type` | `20.4.1` | `@nestjs/common` | Moderate | `file-type@20.x` remains in the vulnerable range reported by npm audit. Updating safely requires upstream Nest dependency movement or a tested major override. |
| `lodash` | `4.17.21` | `@nestjs/config`, `@nestjs/cli` dev tree | High/Moderate | Production audit path is through `@nestjs/config`. npm audit points to a major `@nestjs/config` upgrade. |
| `multer` | `2.0.2` | `@nestjs/platform-express` | High | `multer@2.1.1` exists, but Nest 10.4.22 pins `multer` exactly. An npm override was tested and did not change the lockfile, so this remains tied to the Nest upgrade. |
| `postcss` | `8.4.31` | bundled under `next@14.2.35` | Moderate | Root `postcss` is `8.5.10`; the remaining vulnerable copy is bundled by Next and requires a Next upgrade. |

## Safe Patch/Minor Review

- `multer@2.1.1` is available in the same major line, but `@nestjs/platform-express@10.4.22` pins `multer@2.0.2`; npm override did not produce an effective lockfile change.
- `file-type@20.5.0` exists, but npm audit reports `file-type` versions through `21.3.1` as vulnerable, so no safe `20.x` patch resolves the advisory.
- The previously unsafe `xlsx` package was not kept. AcadID uses `read-excel-file` for XLSX parsing.
- No secret values were read into this file or committed.

## Deferred Major Upgrade Tasks

1. Plan Nest upgrade from `10.4.22` to at least `11.1.19`.
   - Affected areas: API bootstrap, guards, interceptors, controllers, worker application context, platform-express behavior.
   - Required tests: `npm run typecheck`, `npm test`, `npm run smoke:api`, worker once, authenticated founder login, API key token exchange, ingestion, governance publish, verification.

2. Plan Next upgrade from `14.2.35` to a version outside the audit range, currently audit suggests `16.2.6`.
   - Affected areas: Founder Console app router build, Next dev cache behavior, CSS/PostCSS pipeline, deployment build output.
   - Required tests: `npm run typecheck`, `npm test`, local `http://localhost:3000` render, mobile/responsive dashboard smoke, founder login.

3. Review `@nestjs/config@4.0.4` as part of the Nest upgrade.
   - Affected areas: config module initialization and environment loading.
   - Required tests: API startup with root `.env`, Supabase connection, credential-signing config, storage config, worker config.

## Current Risk Position

The remaining audit items are real and should be handled before production. For pilot development, they are documented and deferred because their automated fix path is a major framework upgrade. The current application does not expose direct file-upload parsing through Nest multipart routes yet; bulk import files are processed through queued worker jobs and controlled storage metadata.
