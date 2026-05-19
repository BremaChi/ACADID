# Institution Portal Storage And MOU Runbook

Owner: Core Platform Team / Data Center API
Audience: Institution Portal Team, Founder, operations engineer
Status: Pilot configuration guide

## Purpose

The Institution Portal collects registration documents and signed MOU files, but storage remains controlled through the AcadID Data Center API. Product teams must not create a separate document store for institution onboarding.

## Environment Variables

Configure these in the API environment:

```text
SUPABASE_STORAGE_BUCKET=acadid-portal-intake
ACADID_PORTAL_UPLOAD_BASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL=
ACADID_OBJECT_STORAGE_BEARER_TOKEN=
ACADID_MOU_VERSION=2026.1
ACADID_MOU_EFFECTIVE_FROM=2026-05-01
ACADID_MOU_TEMPLATE_URL=
ACADID_MOU_TEMPLATE_CHECKSUM=
```

`OBJECT_STORAGE_BUCKET` and `STORAGE_BUCKET` remain backward-compatible aliases, but `SUPABASE_STORAGE_BUCKET` is the preferred pilot name.

For background imports, the worker can download `storage://bucket/key` objects in either of two ways:

- Supabase private storage: set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Internal download gateway: set `ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL` and optional `ACADID_OBJECT_STORAGE_BEARER_TOKEN`.

Never expose service-role keys to the browser. The Institution Portal should only receive upload tickets and `storageUrl` metadata.

## Current Sandbox Behavior

If `ACADID_PORTAL_UPLOAD_BASE_URL` is empty:

- `POST /api/portal/upload-urls` returns `PROVIDER_CONFIGURATION_REQUIRED`.
- The response still includes a `storageUrl`.
- Institution Portal Team may submit that `storageUrl` as sandbox metadata in `documentUploads`.

This is acceptable for UI integration, not for production document intake.

## Pilot Behavior

Before real institution onboarding:

1. Create a Nigeria-aligned Supabase storage bucket or approved storage bucket.
2. Set `SUPABASE_STORAGE_BUCKET`.
3. Configure the upload URL provider base through `ACADID_PORTAL_UPLOAD_BASE_URL`.
4. Upload the active MOU template to controlled storage.
5. Set `ACADID_MOU_TEMPLATE_URL`.
6. Set `ACADID_MOU_TEMPLATE_CHECKSUM` to the template checksum.
7. Restart the API.
8. Call `GET /api/portal/mou-version`.
9. Call `POST /api/portal/upload-urls` with an Institution Portal product token.

Expected upload-ticket status:

```text
ISSUED
```

## Required Security Rules

- Keep upload-ticket issuance behind `institution:apply`.
- Accept only allowed content types from the shared schema.
- Keep the upload expiry short.
- Store checksums where available.
- Do not expose private storage credentials to browsers.
- Do not let the Institution Portal write directly to Supabase core tables.
- Let the background worker download `storage://bucket/key` files with backend credentials only.

## Institution Portal Team Contract

Institution Portal Team should call:

- `GET /api/portal/mou-version`
- `POST /api/portal/upload-urls`
- `POST /api/portal/institution-applications`

If the portal needs new document fields, add a request to:

```text
docs/contracts/API_CONTRACTS.md
```

## Founder Console Check

System Health should show Storage Service as operational when a storage bucket variable is configured.

Institution Applications should show uploaded document metadata after successful submission.
