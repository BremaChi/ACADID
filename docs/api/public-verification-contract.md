# Public Verification Contract

This contract covers public verification gateway routes. Product teams must use these routes instead of reading Supabase tables directly.

## Credential Reference

```http
GET /api/verify/ref/:credentialRef
```

Returns credential status, issuer summary, W3C VC payload, and `cryptographicStatus` for the credential reference. Successful valid checks write a `VerificationEvent` and may create a billable revenue ledger entry when `ACADID_VERIFICATION_FEE_MINOR` is configured.

## Credential Status

```http
GET /api/verify/status/:credentialRef
```

Returns a small cached status response for revocation/status checks.

## AIN Lookup

```http
GET /api/verify/ain/:ain
```

Returns a safe learner summary for a public Academic Identity Number:

- `ain`
- `fullName`
- `identityStatus`
- active credential count
- up to 10 recent credential references with issuer summary

It must not return date of birth, phone, NIN, BVN, private academic scores, or internal UUIDs.

## Bulk Verification

```http
POST /api/verify/bulk
Content-Type: application/json

{
  "credentialRefs": ["CRED-001"],
  "ains": ["AIN-NG-2026-0001"]
}
```

Rules:

- Maximum 50 identifiers per request.
- Duplicate identifiers are deduplicated before processing.
- The route is rate-limited separately from single verification.
- Each credential reference is verified through the same reference verification path.
- Each AIN lookup uses the same safe AIN lookup path.

Response shape:

```json
{
  "outcome": "COMPLETED",
  "total": 2,
  "confirmed": 2,
  "revoked": 0,
  "denied": 0,
  "credentials": [],
  "learnerLookups": []
}
```

Partners may send optional headers:

- `x-acadid-verifier-name`
- `x-acadid-verifier-email`

AcadID stores verifier email encrypted and stores IP addresses only as hashes in verification events.
