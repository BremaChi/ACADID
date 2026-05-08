# AcadID Security Upgrade Plan

Status: Planned, not yet started  
Upgrade branch: `security/framework-upgrade`  
Rule: do not run `npm audit fix --force` blindly.

## Purpose

The current codebase has documented framework-level audit advisories. The fix path requires planned major upgrades, so this must be handled as a separate upgrade sprint with a branch, baseline validation, incremental changes, and a rollback path.

## Baseline Before Upgrade Sprint

Before changing framework versions:

```text
git checkout main
git pull
git checkout -b security/framework-upgrade
npm install
npm run typecheck
npm test
npm run smoke:api
```

Do not begin the upgrade if baseline validation fails.

## Planned Upgrades

### 1. NestJS Framework

Current versions:

- `@nestjs/common`: `10.4.22`
- `@nestjs/core`: `10.4.22`
- `@nestjs/platform-express`: `10.4.22`
- `@nestjs/cli`: `10.4.9`

Target version:

- At least `11.1.19`, or latest stable after checking release notes.

Reason:

- `@nestjs/core` has a moderate advisory.
- `@nestjs/platform-express` pulls vulnerable `multer@2.0.2`.
- `@nestjs/common` pulls vulnerable `file-type@20.4.1`.
- Audit recommends Nest 11.x for the automated fix path.

Breaking changes to check:

- Nest application bootstrap behavior.
- `NestFactory.create` and `createApplicationContext`.
- Guards and decorators: `AuthGuard`, `RolesGuard`, `ScopesGuard`.
- Interceptors, especially request audit interceptor.
- `@nestjs/platform-express` request/response behavior.
- Dependency injection metadata and module exports.

Files likely affected:

- `apps/api/src/main.ts`
- `apps/api/src/worker.ts`
- `apps/api/src/modules/app.module.ts`
- `apps/api/src/modules/worker.module.ts`
- `apps/api/src/modules/auth/guards/*.ts`
- `apps/api/src/modules/platform/interceptors/request-audit.interceptor.ts`
- API module files under `apps/api/src/modules/**`
- `apps/api/package.json`
- `package-lock.json`

Migration considerations:

- Upgrade Nest packages together; do not mix Nest 10 and Nest 11 core packages.
- Review peer dependencies before installing.
- Keep worker entrypoint functional; it uses `createApplicationContext`.
- Check whether `@nestjs/config` should move in the same pass.

Test plan:

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run smoke:api`
- `npm run worker:once`
- API health: `GET /api/health`
- Founder login and MFA prompt behavior.
- API key token exchange.
- Institution creation and Authority Grant creation.
- Student ingestion.
- Result governance publish.
- Credential verification.

Rollback plan:

- Stop the upgrade branch.
- Restore package files from `main`.
- Reinstall dependencies.
- Re-run baseline validation.
- Do not merge the branch.

### 2. Next.js Founder Console

Current version:

- `next`: `14.2.35`

Target version:

- A safe newer major version outside the audit range. Current audit suggests `16.2.6`; confirm latest stable during sprint.

Reason:

- Multiple Next.js audit advisories remain.
- Bundled `postcss@8.4.31` remains vulnerable through Next.js dependency tree.

Breaking changes to check:

- App router behavior.
- Client component boundaries.
- Build output paths.
- Dev server behavior and `.next` cache behavior.
- CSS/PostCSS/Tailwind integration.
- Browser compatibility of Founder Console dashboard.

Files likely affected:

- `apps/web/package.json`
- `apps/web/next.config.*` if added later
- `apps/web/src/app/**`
- `apps/web/src/components/**`
- `apps/web/tailwind.config.*`
- `apps/web/postcss.config.*`
- `package-lock.json`

Migration considerations:

- Upgrade React only if the Next target requires it.
- Keep Founder Console UI behavior stable.
- Re-test mobile drawer/sidebar and routed page behavior.
- Re-test API client calls from the dashboard.

Test plan:

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run smoke:api`
- Local `http://localhost:3000` render.
- Founder login flow.
- Founder dashboard navigation for all pages.
- API key generation modal.
- Institution Applications flow.
- System Health page.
- Mobile viewport smoke check.

Rollback plan:

- Restore `apps/web/package.json` and `package-lock.json` from `main`.
- Clear `apps/web/.next`.
- Reinstall dependencies.
- Restart local web dev server.
- Do not merge the branch.

### 3. `@nestjs/config`

Current version:

- `@nestjs/config`: `3.3.0`

Target version:

- `4.0.4` or latest stable compatible with the Nest target.

Reason:

- Audit reports `lodash` advisories through `@nestjs/config`.
- Automated audit fix requires a major version.

Breaking changes to check:

- `ConfigModule.forRoot({ isGlobal: true })`.
- Root `.env` loading expectations.
- Runtime environment variables for Supabase, credential signing, storage, worker, JWT, and MFA.

Files likely affected:

- `apps/api/src/modules/app.module.ts`
- `apps/api/src/modules/worker.module.ts`
- scripts that load root `.env`
- docs mentioning runtime variables
- `apps/api/package.json`

Migration considerations:

- Keep root `.env` behavior unchanged.
- Confirm worker process sees the same environment values as API process.
- Do not log secrets during config validation.

Test plan:

- API startup with root `.env`.
- `npm run smoke:api`.
- `npm run worker:once`.
- System Health page and API response.
- Credential signing readiness check.
- Storage download config check.

Rollback plan:

- Restore previous config package version.
- Reinstall dependencies.
- Re-run baseline API and worker checks.

### 4. Affected Transitive Dependencies

Known transitive packages:

- `file-type@20.4.1` through `@nestjs/common`
- `multer@2.0.2` through `@nestjs/platform-express`
- `lodash@4.17.21` through `@nestjs/config`
- `postcss@8.4.31` bundled by `next@14.2.35`

Target versions:

- Let framework packages resolve safe compatible versions where possible.
- Only use overrides if the framework package supports the newer version and tests pass.

Migration considerations:

- Avoid direct transitive overrides that create a false sense of safety.
- If an override is used, verify with `npm ls <package>` and `npm audit --omit=dev --json`.

## Upgrade Sprint Rules

- Create branch `security/framework-upgrade` before starting.
- Upgrade incrementally.
- Prefer safe patch/minor updates first.
- Do not run `npm audit fix --force`.
- Do not merge until all validation passes.
- Do not commit `.env` or secret values.
- Update `SECURITY_NOTES.md` and this plan after the sprint.

## Required Final Validation

After all upgrades:

```text
npm install
npm run typecheck
npm test
npm run smoke:api
npm run worker:once
```

Manual/local checks:

- Founder login flow.
- API health.
- Upload flow.
- Supabase DB flow.
- Webhook delivery.
- Queue workers.
- Founder Console page navigation.

Merge criteria:

- All tests pass.
- Smoke test is verified end to end.
- No secret values are committed.
- Remaining audit findings, if any, are documented with owners and dates.
