# Engineer 2 Handoff: Institution Portal

Owner: Engineer 2  
Dependency owner: Engineer 1 / Data Center API  
Status: Ready for sandbox integration  
Last updated: 2026-05-01

## Mission

Build the public Institution Portal product without bypassing the AcadID Data Center API.

The Institution Portal is the onboarding product for Nigerian schools and accredited bodies. It collects institution applications, document metadata, and digital MOU acceptance, then sends the application to the Founder Console approval queue.

Engineer 2 must not connect directly to Supabase, Prisma, or any private database table.

## Product Boundary

Institution Portal owns:

- Public marketing/onboarding pages.
- Institution application form.
- Document upload UI and upload-status display.
- Digital MOU acceptance UI.
- Submission success and pending-review state.
- Future approved-institution dashboard shell.

Data Center API owns:

- Authentication and API-key exchange.
- Application validation.
- Duplicate pending application prevention.
- Application persistence.
- Founder approval/rejection workflow.
- Institution creation after approval.
- Audit and governance records.

## Required API Key

Ask the Founder to generate an Internal Product API Key for:

- Product: `Institution Portal`
- Product code: `INSTITUTION_PORTAL`
- Scope: `institution:apply`
- Environment: `SANDBOX` for development

The Founder Console shows the `client_secret` once. Store it only in the Institution Portal backend environment, never in browser JavaScript.

## Authentication Flow

The Institution Portal backend exchanges its product credentials for a bearer token.

Endpoint:

```http
POST /api/auth/token
Content-Type: application/json
```

Request:

```json
{
  "client_id": "PRODUCT_CLIENT_ID",
  "client_secret": "PRODUCT_CLIENT_SECRET"
}
```

Success response:

```json
{
  "accessToken": "JWT",
  "tokenType": "Bearer",
  "expiresIn": 86400,
  "apiClient": {
    "clientId": "string",
    "label": "Institution Portal",
    "ownerType": "PRODUCT",
    "productCode": "INSTITUTION_PORTAL",
    "productName": "Institution Portal",
    "institutionId": null,
    "institutionName": null,
    "scopes": ["institution:apply"],
    "environment": "SANDBOX",
    "rateLimitPerMinute": 1000
  }
}
```

Use this token server-side when submitting applications. Do not expose the token to the browser.

## Institution Application Endpoint

Endpoint:

```http
POST /api/portal/institution-applications
Authorization: Bearer <token from /api/auth/token>
Content-Type: application/json
```

Required scope:

```text
institution:apply
```

Request body:

```json
{
  "officialName": "Greenfield Secondary School",
  "type": "SECONDARY_JSS",
  "state": "Lagos",
  "address": "12 Example Road, Ikeja, Lagos",
  "contactPersonName": "Ada Okafor",
  "contactEmail": "registrar@example.edu.ng",
  "studentVolume": 1200,
  "documentUploads": [
    {
      "label": "Registration Certificate",
      "storageUrl": "pending-secure-storage-url-or-upload-reference",
      "checksum": "optional-file-checksum"
    }
  ],
  "mouAccepted": true
}
```

Supported `type` values:

- `NURSERY`
- `PRIMARY`
- `SECONDARY_JSS`
- `SECONDARY_SSS`
- `COMBINED_SCHOOL`
- `POLYTECHNIC`
- `COLLEGE_OF_EDUCATION`
- `UNIVERSITY`
- `EXAM_BODY`

Success response:

```json
{
  "accepted": true,
  "applicationId": "uuid",
  "status": "PENDING",
  "institutionName": "Greenfield Secondary School",
  "institutionType": "SECONDARY_JSS",
  "submittedAt": "2026-05-01T09:00:00.000Z"
}
```

Expected error behavior:

- Missing/invalid fields return `400`.
- Duplicate pending application for the same contact email returns `400`.
- Missing token, expired token, wrong API key, or missing scope returns `401` or `403`.

## MVP Screens

Build these first:

1. Public landing page
2. Institution registration form
3. Document metadata step
4. MOU acceptance step
5. Review and submit step
6. Submission success page
7. Pending-review status page

Do not build full institution dashboard features until Founder-approved institution login is available.

## UI Rules

Follow root `AGENTS.md`.

Important:

- Mobile-first.
- ACAD.ID navy/blue only.
- Calm SaaS quality, not a school portal look.
- Clear title, subtitle, action button, and empty state on every page.
- No database, token, or internal API debug details shown to public users.

## Security Rules

- Product `client_secret` must live only in backend environment variables.
- Browser submits to Institution Portal backend, not directly to the Data Center API.
- Institution Portal backend submits to Data Center API with bearer token.
- Do not use Supabase frontend SDK for core AcadID data.
- Do not store NIN, BVN, DOB, or student records in the Institution Portal MVP.
- Do not expose internal UUIDs as public identity.
- Do not create institution accounts until Founder approval is implemented through the Data Center API.

## Data Residency And Privacy

For MVP, collect only what the Data Center API currently accepts:

- Institution name.
- Institution type.
- State.
- Address.
- Contact person name.
- Contact email.
- Student volume.
- Document upload metadata.
- MOU acceptance.

The Institution Portal must not add extra sensitive fields unless Engineer 1 updates the API contract first.

## Acceptance Checklist

Engineer 2 is done with MVP integration when:

- Product key is generated in Founder Console with `institution:apply`.
- Backend exchanges key through `POST /api/auth/token`.
- Portal submits a valid application through `POST /api/portal/institution-applications`.
- Founder Console shows the application under Institution Applications.
- Duplicate pending contact email is handled cleanly.
- Invalid payload shows human form errors.
- No secret is visible in browser source, logs, or network calls.
- Mobile layout works without broken tables or oversized hero sections.

## Out Of Scope For Engineer 2 MVP

- Direct database access.
- Supabase frontend SDK for AcadID core data.
- Live Results API.
- Learner ingestion.
- Result publishing.
- Credential signing.
- Institution API key generation.
- Founder approval logic.
- Student mobile app.
- Employer verification portal.

## Engineer 1 Contact Surface

If Engineer 2 needs a new field or route, request it through the Data Center API contract. Do not add a separate data store or shadow schema in the Institution Portal.
