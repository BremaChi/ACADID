# AcadID Webhook Receiver Contract

AcadID webhooks notify approved institutions, exam bodies, employer/developer integrations, and product services when Data Center events are ready outside the request path. Receivers must treat every webhook as an at-least-once delivery and verify the signature before processing the payload.

## Delivery Model

- AcadID sends webhooks from background workers, not from user-facing HTTP requests.
- Every delivery has a stable delivery id and stable idempotency key.
- Failed deliveries are retried with exponential backoff.
- Exhausted deliveries move to failed/dead-letter state for operator review.
- Founder operators can retry an existing delivery or replay it as a new delivery.

Receivers must return quickly. If processing is heavy, store the event and process it in the receiver's own worker.

## HTTP Request

AcadID sends:

```http
POST <receiver-url>
content-type: application/json
user-agent: AcadID-Webhook/1.0
x-acadid-event: <eventType>
x-acadid-delivery: <deliveryId>
x-acadid-webhook-endpoint: <endpointId>
x-acadid-idempotency-key: whd_<deliveryId>
x-acadid-timestamp: <unixSeconds>
x-acadid-signature: v1=<hexHmacSha256>
```

`x-acadid-webhook-endpoint` is present for institution-scoped webhook endpoints. Legacy rows without a configured endpoint may omit it and use the platform fallback signing secret.

## Body Shape

```json
{
  "id": "delivery_uuid",
  "eventType": "credential.published",
  "attempt": 1,
  "payload": {
    "credentialId": "cred_...",
    "institutionId": "inst_..."
  },
  "sentAt": "2026-05-09T12:00:00.000Z"
}
```

Do not rely on field order. Verify against the exact raw request body bytes received by the server.

## Signature Verification

AcadID signs this string:

```text
<x-acadid-timestamp>.<x-acadid-delivery>.<rawBody>
```

The signature is HMAC-SHA256 using the receiver endpoint secret shown once during endpoint creation or rotation.

Node example:

```ts
import crypto from "node:crypto";

export function verifyAcadidWebhook(input: {
  rawBody: Buffer | string;
  deliveryId: string;
  timestamp: string;
  signatureHeader: string;
  secret: string;
}) {
  const expectedPrefix = "v1=";
  if (!input.signatureHeader.startsWith(expectedPrefix)) {
    return false;
  }

  const signed = `${input.timestamp}.${input.deliveryId}.${input.rawBody.toString()}`;
  const digest = crypto
    .createHmac("sha256", input.secret)
    .update(signed)
    .digest("hex");

  const received = input.signatureHeader.slice(expectedPrefix.length);
  const digestBuffer = Buffer.from(digest, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  if (receivedBuffer.length !== digestBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(digestBuffer, receivedBuffer);
}
```

Receiver checklist:

- Reject missing signature, delivery id, timestamp, or idempotency key.
- Reject timestamps outside a short replay window, normally five minutes.
- Compare signatures with a constant-time comparison.
- Store processed idempotency keys and ignore duplicate deliveries.
- Do not process events from suspended or unknown endpoints.

## Response Rules

- Return `2xx` only after the receiver has safely accepted the event.
- Return `400` for malformed requests that should not be retried.
- Return `401` or `403` for failed signature or disabled endpoint checks.
- Return `409` only if the duplicate idempotency key is already accepted and no retry is needed.
- Return `429` or `5xx` when AcadID should retry later.

Recommended success body:

```json
{
  "received": true,
  "deliveryId": "delivery_uuid"
}
```

## Idempotency

Use `x-acadid-idempotency-key` as the receiver-side dedupe key. The same delivery retry keeps the same key. A Founder replay creates a new delivery and a new key.

Minimum receiver table fields:

- `idempotency_key`
- `delivery_id`
- `event_type`
- `status`
- `received_at`
- `processed_at`
- `last_error`

## Supported Event Families

Initial event families are:

- `institution.*`
- `result.*`
- `credential.*`
- `verification.*`
- `record_request.*`
- `payment.*`
- `developer_access.*`

Exact event payloads should be versioned before external partner launch. Until then, integrations must accept additive fields and ignore unknown properties.

## Secret Rotation

Endpoint secrets are shown once. Receivers must store them in a secret manager, not in frontend code or source control.

Rotation process:

1. Founder rotates the endpoint secret.
2. Receiver updates its secret store.
3. Receiver validates a test delivery.
4. Old deliveries already signed with the previous secret should be retried before rotation where possible.

## Local Testing

Use a tunnel only for local development. Do not expose production secrets through local tunnel logs.

Test cases before enabling production:

- Valid signature succeeds.
- Invalid signature fails.
- Old timestamp fails.
- Duplicate idempotency key is ignored safely.
- Receiver returns quickly and defers heavy work.
- Receiver handles retry attempts without duplicating side effects.
