# Record Request Fulfillment Contract

RecordRequest is the graduate and historical-record workflow. It is separate from normal current-student result upload, but fulfillment still publishes a signed AcadID credential into the learner passport.

## Payment And Escrow Fields

RecordRequest now tracks:

- `paymentStatus`: `NOT_REQUIRED`, `PENDING`, `PAID`, `WAIVED`, `REFUNDED`
- `escrowStatus`: `NONE`, `HELD`, `RELEASED`, `REFUND_PENDING`, `REFUNDED`
- `amountMinor`, `currency`, `paymentReference`, `paymentProvider`
- `paymentHeldAt`, `paymentReleasedAt`, `refundRequestedAt`
- `fulfilledCredentialId`

When `ACADID_RECORD_REQUEST_FEE_MINOR` is configured, new learner requests start as:

- `status: AWAITING_PAYMENT`
- `paymentStatus: PENDING`
- `escrowStatus: NONE`

When no fee is configured, they start as:

- `status: SUBMITTED`
- `paymentStatus: NOT_REQUIRED`
- `escrowStatus: NONE`

## Endpoints

### `POST /access/record-requests`

Learner creates a historical/graduate record request.

Idempotency: supports `x-idempotency-key`.

### `GET /access/record-requests`

Learner lists their own requests.

### `GET /access/passport`

Learner passport includes recent record requests and any fulfilled credential reference.

### `GET /access/credentials`

Learner credentials include `recordRequest` metadata when the credential came from a fulfilled request.

### `GET /govern/record-requests`

Institution/founder governance list.

### `POST /govern/record-requests/:id/review`

Updates review status, assignment, rejection, escalation, and notes.

Important: `FULFILLED` cannot be set through this generic review route. Use the fulfillment route so credential publication and payment release happen atomically.

### `POST /govern/record-requests/:id/payment/confirm`

Marks a payment as paid and held in escrow.

Example:

```json
{
  "paymentReference": "paystack-ref-001",
  "amountMinor": 150000,
  "currency": "NGN",
  "paymentProvider": "PAYSTACK",
  "note": "Payment confirmed by Paystack webhook."
}
```

Result:

- `paymentStatus: PAID`
- `escrowStatus: HELD`
- `paymentHeldAt` set
- audit action: `record_request.payment_confirmed`

### `POST /govern/record-requests/:id/payment/refund`

Requests or confirms a refund for a paid request that is still held in escrow and has not been fulfilled.

Request refund:

```json
{
  "action": "REQUEST",
  "reason": "Institution cannot locate the historical file yet."
}
```

Result:

- `paymentStatus: PAID`
- `escrowStatus: REFUND_PENDING`
- `refundRequestedAt` set
- audit action: `record_request.refund_requested`

Confirm refund:

```json
{
  "action": "CONFIRM",
  "reason": "Refund completed through Paystack.",
  "refundReference": "refund-ref-001",
  "paymentProvider": "PAYSTACK"
}
```

Result:

- `status: CANCELLED` unless already rejected/cancelled
- `paymentStatus: REFUNDED`
- `escrowStatus: REFUNDED`
- writes a negative `CREDENTIAL_EXPORT_FEE` ledger entry with `sourceType: RecordRequestRefund`
- audit action: `record_request.payment_refunded`

Fulfilled, released, or already-published requests are blocked from this automated path and require manual finance review.

### `POST /govern/record-requests/:id/fulfill`

Publishes a signed credential into the learner passport and releases held payment.

Example:

```json
{
  "credentialType": "TRANSCRIPT",
  "note": "Transcript approved and published.",
  "releasePayment": true
}
```

Result:

- creates a `Credential` linked by `recordRequestId`
- sets `fulfilledCredentialId`
- `status: FULFILLED`
- if payment was held, `escrowStatus: RELEASED`
- writes `CREDENTIAL_EXPORT_FEE` revenue ledger row when payment is released
- audit action: `record_request.fulfill`

## Security Rules

- Learners can create and read only their own record requests.
- Institution users can review and fulfill only requests assigned to their institution.
- Founder Admin can review unassigned requests.
- Fulfillment requires a learner and institution link.
- Paid requests must be held in escrow before fulfillment.
- Refund automation is only allowed while paid funds are still held in escrow.
- Fulfillment signs a W3C VC 2.0 aligned payload before database writes.
