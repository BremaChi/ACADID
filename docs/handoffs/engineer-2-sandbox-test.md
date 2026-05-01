# Engineer 2 Sandbox Test Script

Use this to prove the Institution Portal can talk to the AcadID Data Center API.

Never paste real secrets into GitHub, screenshots, or chat logs.

## 1. Generate Product Key

In Founder Console:

1. Open `http://localhost:3000`.
2. Sign in as Founder.
3. Open `API Keys`.
4. Generate an Internal Product API Key.
5. Select `Institution Portal`.
6. Keep the recommended `institution:apply` scope.
7. Save the `client_id` and one-time `client_secret` in the Institution Portal backend `.env`.

Suggested Institution Portal env names:

```bash
ACADID_API_BASE_URL=http://localhost:4000/api
ACADID_PORTAL_CLIENT_ID=...
ACADID_PORTAL_CLIENT_SECRET=...
```

## 2. Exchange Token

```bash
curl -X POST "$ACADID_API_BASE_URL/auth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "'"$ACADID_PORTAL_CLIENT_ID"'",
    "client_secret": "'"$ACADID_PORTAL_CLIENT_SECRET"'"
  }'
```

Expected:

- `tokenType` is `Bearer`.
- `apiClient.ownerType` is `PRODUCT`.
- `apiClient.productCode` is `INSTITUTION_PORTAL`.
- `apiClient.scopes` includes `institution:apply`.

## 3. Submit Application

Use the returned token as `ACCESS_TOKEN`.

```bash
curl -X POST "$ACADID_API_BASE_URL/portal/institution-applications" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
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
        "storageUrl": "pending-secure-storage-url"
      }
    ],
    "mouAccepted": true
  }'
```

Expected:

```json
{
  "accepted": true,
  "status": "PENDING"
}
```

## 4. Verify Founder Queue

In Founder Console:

1. Open `Institution Applications`.
2. Search for the submitted school.
3. Confirm it appears as `PENDING`.
4. Approve or reject from Founder Console.

## 5. Failure Tests

Engineer 2 must handle these:

- Submit without token: expect `401`.
- Submit with wrong scope: expect `403`.
- Submit with invalid email: expect `400`.
- Submit same `contactEmail` twice while pending: expect `400`.
- Submit with `mouAccepted: false`: expect `400`.

## 6. Done Signal

The handoff is complete when the Institution Portal backend can:

- Exchange product credentials for a token.
- Submit a valid application.
- Show user-friendly validation errors.
- Keep all secrets server-side.
- Show the Founder-approved pending state correctly.
