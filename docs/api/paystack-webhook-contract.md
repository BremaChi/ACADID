# Paystack Webhook Contract

AcadID accepts Paystack payment confirmations for RecordRequest escrow through the Data Center API. Products must not mark RecordRequests paid directly from the browser.

## Endpoint

`POST /api/webhooks/paystack`

This endpoint is public but signed. It does not require an AcadID bearer token.

## Required Configuration

- `PAYSTACK_SECRET_KEY`: primary signing secret used to verify Paystack webhooks.
- `PAYSTACK_WEBHOOK_SECRET`: optional fallback name for local or rotated deployments.

Do not expose either value to the frontend.

## Signature Verification

AcadID verifies the `x-paystack-signature` header with HMAC SHA512 over the raw request body. NestJS raw-body capture is enabled in `apps/api/src/main.ts` so verification uses the original bytes before JSON parsing.

Unsigned or invalid requests are rejected before a background job is created.

## Accepted Event

Only `charge.success` changes payment state. Ignored events return a successful acknowledgement with `ignored: true` so Paystack does not retry events AcadID does not need.

## Metadata Matching

AcadID resolves a RecordRequest using this order:

1. `data.metadata.recordRequestId`
2. `data.metadata.record_request_id`
3. `data.metadata.recordRequestUuid`
4. `data.metadata.requestId`
5. `data.metadata.request_id`
6. Existing `paymentReference`
7. `requestId` equal to the Paystack reference

Recommended product metadata:

```json
{
  "requestId": "ARR-0001",
  "recordRequestId": "record-request-uuid"
}
```

## Async Processing

The webhook returns quickly with a background job ID:

```json
{
  "accepted": true,
  "event": "charge.success",
  "reference": "paystack-reference",
  "recordRequestId": "record-request-uuid",
  "requestId": "ARR-0001",
  "jobId": "background-job-uuid",
  "pollingUrl": "/jobs/background-job-uuid"
}
```

The worker then validates event/status/reference/amount/currency, confirms payment only for an open RecordRequest, moves `AWAITING_PAYMENT` requests back to `SUBMITTED`, sets `paymentStatus = PAID`, sets `escrowStatus = HELD`, stores `paymentReference`, stores `paymentProvider = PAYSTACK`, appends a timeline note, writes `record_request.payment_confirmed`, and completes the background job.

## Idempotency

Webhook jobs use idempotency scope `webhook:paystack` and key:

`charge.success:{eventId}:{reference}`

The worker is also idempotent: if a RecordRequest is already paid with the same reference, it succeeds with `already_confirmed`.

## Product Integration Rule

Institution Portal, Student App, Employer Portal, and future payment UI must initialize payment through their own user experience, but final payment confirmation must enter the Data Center through this signed webhook and background worker path.
