# Institution Portal API Contract

This contract is the current integration surface between the Institution Portal product and the AcadID Data Center API.

Base local API URL:

```text
http://localhost:4000/api
```

Production direction:

```text
https://api.acadid.ng/api
```

## Token Exchange

```http
POST /auth/token
```

Body:

```json
{
  "client_id": "string",
  "client_secret": "string"
}
```

Response:

```json
{
  "accessToken": "string",
  "tokenType": "Bearer",
  "expiresIn": 86400,
  "apiClient": {
    "clientId": "string",
    "label": "string",
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

## MOU Version

```http
GET /portal/mou-version
```

This endpoint is public and lets the Institution Portal display the current MOU version before the school accepts it.

Example response:

```json
{
  "version": "2026.1",
  "title": "ACAD.ID Institution Authority MOU",
  "effectiveFrom": "2026-05-01",
  "templateUrl": null,
  "acceptanceRequired": true,
  "acceptanceField": "mouAccepted",
  "checksum": null
}
```

## Issue Upload URL

```http
POST /portal/upload-urls
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Required scope:

```text
institution:apply
```

Body:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `fileName` | string | yes | 3-180 chars |
| `contentType` | enum | yes | `application/pdf`, `image/jpeg`, `image/png`, `image/webp` |
| `sizeBytes` | integer | yes | up to 15 MB |
| `checksum` | string | no | 8-160 chars |
| `purpose` | enum | yes | see supported upload purposes |

Supported upload purposes:

```text
REGISTRATION_CERTIFICATE
ACCREDITATION_LETTER
SIGNED_MOU
OTHER_SUPPORTING_DOCUMENT
```

Example request:

```json
{
  "fileName": "registration-certificate.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 120000,
  "checksum": "sha256-example",
  "purpose": "REGISTRATION_CERTIFICATE"
}
```

Example response:

```json
{
  "uploadId": "uuid",
  "status": "PROVIDER_CONFIGURATION_REQUIRED",
  "method": "PUT",
  "uploadUrl": null,
  "storageUrl": "storage://acadid-portal-intake/portal-applications/2026-05-06/uuid-registration-certificate.pdf",
  "storageKey": "portal-applications/2026-05-06/uuid-registration-certificate.pdf",
  "expiresAt": "2026-05-06T09:15:00.000Z",
  "maxBytes": 15728640,
  "requiredHeaders": {
    "content-type": "application/pdf"
  },
  "document": {
    "label": "Registration Certificate",
    "purpose": "REGISTRATION_CERTIFICATE",
    "fileName": "registration-certificate.pdf",
    "contentType": "application/pdf",
    "sizeBytes": 120000,
    "checksum": "sha256-example"
  },
  "warning": "Storage signing is not configured in this environment. Use storageUrl as a metadata placeholder for sandbox application submission."
}
```

When `ACADID_PORTAL_UPLOAD_BASE_URL` is configured, `status` becomes `ISSUED` and `uploadUrl` contains the provider upload URL. Until then, Engineer 2 should use the returned `storageUrl` as sandbox metadata in `documentUploads`.

## Create Institution Application

```http
POST /portal/institution-applications
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Body schema:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `officialName` | string | yes | 2-180 chars |
| `type` | enum | yes | see supported types |
| `state` | string | yes | 2-80 chars |
| `address` | string | yes | 5-300 chars |
| `contactPersonName` | string | yes | 2-120 chars |
| `contactEmail` | email | yes | max 254 chars |
| `studentVolume` | integer | yes | 1 to 10,000,000 |
| `documentUploads` | array | no | max 20 |
| `mouAccepted` | boolean literal | yes | must be `true` |

Supported `type` enum:

```text
NURSERY
PRIMARY
SECONDARY_JSS
SECONDARY_SSS
COMBINED_SCHOOL
POLYTECHNIC
COLLEGE_OF_EDUCATION
UNIVERSITY
EXAM_BODY
```

Document upload object:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `label` | string | yes | 2-80 chars |
| `storageUrl` | string | yes | 3-500 chars |
| `checksum` | string | no | max 160 chars |

Example request:

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
      "storageUrl": "pending-secure-storage-url",
      "checksum": "sha256-example"
    }
  ],
  "mouAccepted": true
}
```

Example success:

```json
{
  "accepted": true,
  "applicationId": "4dd29a5d-06ac-4c2a-85a5-021588ea263a",
  "status": "PENDING",
  "institutionName": "Greenfield Secondary School",
  "institutionType": "SECONDARY_JSS",
  "submittedAt": "2026-05-01T09:00:00.000Z"
}
```

## Current Error Shape

Validation errors may return a NestJS `BadRequestException` payload. Treat any non-2xx response as a failed submit and show a human-safe message.

Common failures:

```json
{
  "message": "An institution application is already pending for this contact email.",
  "error": "Bad Request",
  "statusCode": 400
}
```

Schema validation failures may include field error objects from Zod. Do not show raw JSON to public users; map them to the relevant form field where possible.

## Founder Review Dependency

After successful submission, the application appears in Founder Console:

```text
Institution Applications
```

Founder can:

- Approve.
- Reject.
- Review submitted fields.
- Create the active institution partner account on approval.

## Contract Stability Notes

This route is safe for Engineer 2 MVP work. Future additions should be additive where possible:

- Application status lookup endpoint.
- Approved institution login bootstrap endpoint.

Do not change the current request fields without updating both:

- `packages/shared/src/schemas.ts`
- This contract document
