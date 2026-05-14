# AcadID Security Notes

Last reviewed: 2026-05-14

## Dependency Hardening Policy

Do not run `npm audit fix --force` blindly. Framework upgrades must be isolated, tested, and documented because AcadID relies on NestJS routing/auth guards, background workers, Prisma build output, and the Next.js Founder Console.

This review used:

```text
npm audit --omit=dev --json
npm ls @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config next react react-dom file-type lodash multer postcss --all
npm run typecheck
npm test
npm run db:generate
npm run db:deploy
npm run smoke:api
npm run worker:once
```

No secret values were read into this file or committed.

## Upgraded Direct Dependencies

| Package | Previous | Current | Status |
| --- | ---: | ---: | --- |
| `@nestjs/common` | `10.4.22` | `11.1.21` | Upgraded and deduped. `file-type` now resolves to `21.3.4`. |
| `@nestjs/core` | `10.4.22` | `11.1.21` | Upgraded and validated by build, tests, API smoke, and worker smoke. |
| `@nestjs/platform-express` | `10.4.22` | `11.1.21` | Upgraded. `multer` now resolves to `2.1.1`. |
| `@nestjs/config` | `3.3.0` | `4.0.4` | Upgraded. `lodash` now resolves to `4.18.1`. |
| `@nestjs/cli` | `10.4.9` | `11.0.21` | Upgraded with the API workspace. |
| `next` | `14.2.35` | `16.2.6` | Upgraded and production build passes. One bundled PostCSS audit advisory remains. |
| `react` / `react-dom` | `18.3.1` | `19.2.6` | Upgraded for Next 16 compatibility. |
| `tailwindcss` | `3.4.17` | `3.4.19` | Safe patch/minor update. |
| `postcss` | `8.5.10` | `8.5.14` | Root/web PostCSS is patched; Next still bundles its own `8.4.31`. |

## Remaining Audit Finding

`npm audit --omit=dev --json` now reports 2 moderate findings, both from the same framework-pinned path:

| Package | Path | Severity | Reason |
| --- | --- | --- | --- |
| `postcss` | `node_modules/next/node_modules/postcss@8.4.31` | Moderate | Next `16.2.6` declares exact dependency `postcss: 8.4.31`. |
| `next` | affected through bundled `postcss` | Moderate | npm audit reports the direct `next` package because it owns the vulnerable nested dependency. |

Important note: npm audit suggests `next@9.3.3` as a "fix", but that is an unsafe major downgrade and is not acceptable for AcadID. A targeted npm override was tested and did not replace the exact bundled Next dependency, so the finding remains documented until Next publishes a stable release that updates its internal PostCSS.

## Resolved Transitive Findings

| Package | Previous Path | Current Result |
| --- | --- | --- |
| `file-type` | `@nestjs/common -> file-type@20.4.1` | Resolved by Nest 11.1.21 and dedupe to `file-type@21.3.4`. |
| `multer` | `@nestjs/platform-express -> multer@2.0.2` | Resolved by Nest 11.1.21 to `multer@2.1.1`. |
| `lodash` | `@nestjs/config -> lodash@4.17.21` | Resolved by `@nestjs/config@4.0.4` to `lodash@4.18.1`. |

## Validation Results

Passed on branch `security/framework-upgrade`:

```text
npm run typecheck
npm test
npm run db:generate
npm run db:deploy
npm run smoke:api
npm run worker:once
```

Smoke coverage confirmed:

- API health route returned `ok`.
- Founder login worked.
- Institution creation worked.
- Developer access approval worked.
- API client token exchange worked.
- Learner ingestion worked.
- Result governance publishing worked.
- Credential issuance and verification worked with `cryptographicStatus: VALID`.
- Worker processed queued jobs.

## Current Risk Position

The high-severity audit findings from Nest/Next framework packages have been removed. The only remaining audit issue is a moderate Next-owned PostCSS dependency that cannot be safely fixed in this codebase without an upstream Next release or an unsafe downgrade. Keep tracking this before production hardening, but do not block current foundation work on a forced audit downgrade.
