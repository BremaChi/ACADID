# AcadID Security Upgrade Plan

Status: Framework upgrade sprint executed on branch `security/framework-upgrade`  
Last updated: 2026-05-14  
Rule: do not run `npm audit fix --force` blindly.

## Purpose

AcadID is infrastructure, so dependency hardening must be deliberate. This plan records the framework upgrade path, validation requirements, rollback approach, and the remaining upstream-owned risk.

## Sprint Branch

```text
security/framework-upgrade
```

This branch upgrades the major framework packages while preserving the existing API, worker, Supabase, and Founder Console behavior.

## Completed Upgrades

### 1. NestJS Framework

Previous versions:

- `@nestjs/common`: `10.4.22`
- `@nestjs/core`: `10.4.22`
- `@nestjs/platform-express`: `10.4.22`
- `@nestjs/cli`: `10.4.9`

Current versions:

- `@nestjs/common`: `11.1.21`
- `@nestjs/core`: `11.1.21`
- `@nestjs/platform-express`: `11.1.21`
- `@nestjs/cli`: `11.0.21`

Reason:

- Remove framework advisories and resolve vulnerable transitive `file-type` and `multer` paths.

Files touched:

- `apps/api/package.json`
- `package-lock.json`

Validation:

- API build passed through `npm test`.
- API typecheck passed.
- API health and Supabase smoke passed.
- Worker once passed.
- Existing 114 tests passed.

Rollback plan:

- Restore `apps/api/package.json` and `package-lock.json` from `main`.
- Run `npm install`.
- Re-run `npm run typecheck`, `npm test`, and `npm run smoke:api`.

### 2. `@nestjs/config`

Previous version:

- `@nestjs/config`: `3.3.0`

Current version:

- `@nestjs/config`: `4.0.4`

Reason:

- Resolve lodash advisories through the config package.
- Keep root `.env` behavior working for Supabase runtime and migration URLs.

Validation:

- API startup loaded configuration successfully.
- `npm run smoke:api` reached Supabase and completed full founder/institution/credential flow.
- `npm run worker:once` started a worker application context successfully.

Rollback plan:

- Restore `@nestjs/config` version from `main`.
- Reinstall and re-run API + worker checks.

### 3. Next.js Founder Console

Previous versions:

- `next`: `14.2.35`
- `react`: `18.3.1`
- `react-dom`: `18.3.1`

Current versions:

- `next`: `16.2.6`
- `react`: `19.2.6`
- `react-dom`: `19.2.6`

Reason:

- Move off older Next advisories and keep Founder Console compatible with a current stable framework line.

Files touched:

- `apps/web/package.json`
- `apps/web/next-env.d.ts`
- `package-lock.json`

Validation:

- Founder Console production build passed with Next `16.2.6`.
- Web TypeScript passed.
- Root test command passed.

Manual follow-up before merge:

- Start the web dev server and visually confirm `http://localhost:3000`.
- Confirm Founder Console login and routed dashboard pages in the browser.
- Confirm mobile drawer/sidebar layout.

Rollback plan:

- Restore `apps/web/package.json`, `apps/web/next-env.d.ts`, and `package-lock.json` from `main`.
- Clear `apps/web/.next`.
- Run `npm install`, `npm run typecheck`, and `npm test`.

## Remaining Upstream Item

`next@16.2.6` still declares exact dependency `postcss@8.4.31`. npm audit reports this as a moderate advisory through `node_modules/next/node_modules/postcss`.

Action:

- Track the next stable Next.js release that updates its bundled PostCSS dependency.
- Do not downgrade to `next@9.3.3`, even though npm audit suggests it.
- Do not hide the issue with an ineffective override.

## Required Final Validation Before Merge

Already passed:

```text
npm run typecheck
npm test
npm run db:generate
npm run db:deploy
npm run smoke:api
npm run worker:once
```

Still recommended as a manual browser check before merge:

```text
npm run dev --workspace @acadid/web
```

Then verify:

- Founder login flow.
- Dashboard overview.
- Institutions page.
- Institution Applications page.
- API key generation modal.
- Developer Access Requests page.
- System Health page.
- Mobile sidebar/drawer behavior.

## Merge Criteria

- All automated checks pass.
- Manual Founder Console browser smoke passes.
- `SECURITY_NOTES.md` documents any remaining audit findings.
- No `.env` or secret values are committed.
- Branch is pushed for review before merging to `main`.
