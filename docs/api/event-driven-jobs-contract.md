# Event-Driven Jobs Contract

AcadID must not make users wait while heavy work is processed. Gateway and product APIs should accept valid requests quickly, create a durable `BackgroundJob`, write a `DomainEvent`, and return a polling URL.

## Heavy Work Goes To Queues

Queue these workflows instead of processing synchronously:

- Bulk student uploads: `BULK_STUDENT_UPLOAD`, queue `ingestion.bulk`.
- Result batch validation: `RESULT_BATCH_VALIDATION`, queue `results.validation`.
- Credential generation: `CREDENTIAL_GENERATION`, queue `credentials.generation`.
- PDF generation: `PDF_GENERATION`, queue `documents.pdf`.
- SMS/email delivery: `SMS_EMAIL_DELIVERY`, queue `notifications.delivery`.
- Paystack payment confirmation: `PAYSTACK_PAYMENT_CONFIRMATION`, queue `payments.paystack`.
- Record request deadlines: `RECORD_REQUEST_DEADLINE`, queue `record-requests.deadlines`.
- Webhook delivery: `WEBHOOK_DELIVERY`, queue `webhooks.delivery`.
- Push notification fanout: `PUSH_NOTIFICATION`, queue `notifications.push`.
- Live Results callbacks: `LIVE_RESULTS_CALLBACK`, queue `live-results.callbacks`.
- Exam body ingestion: `EXAM_BODY_INGEST`, queue `exam-body.ingest`.

## Accepted Response Shape

New async endpoints should return this shape:

```json
{
  "accepted": true,
  "processing": "QUEUED",
  "job": {
    "jobId": "uuid",
    "type": "BULK_STUDENT_UPLOAD",
    "queue": "ingestion.bulk",
    "status": "QUEUED",
    "eventId": "uuid",
    "pollingUrl": "/jobs/uuid"
  }
}
```

## Polling

Clients may poll lightly for upload progress, batch status, and dashboard refresh:

- `GET /api/jobs/:id`
- Requires bearer auth.
- Founder can read all jobs.
- Institution users and institution API keys can read jobs for their institution.
- Response does not expose the original job payload because payloads may contain student data or secrets.

## Webhooks And Notifications

Use `DomainEvent` as the durable outbox. Workers should convert relevant events into:

- `WebhookDelivery` records for Paystack, exam bodies, Live Results API callbacks, employers, and developer integrations.
- `Notification` records for push/email/SMS events such as result published, record request updated, dispute response, credential viewed, and share link used.

## Current MVP Implementation

Implemented now:

- `POST /api/ingest/bulk-upload` queues `BULK_STUDENT_UPLOAD`.
- `POST /api/ingest/results/async` queues `RESULT_BATCH_VALIDATION`.
- `GET /api/jobs/:id` returns safe job status for light polling.
- Prisma models exist for `BackgroundJob`, `DomainEvent`, `WebhookDelivery`, and `Notification`.
- `npm run worker` starts the long-running worker process.
- `npm run worker:once` processes one small batch and exits, useful for local checks and scheduled jobs.

Current worker processors:

- `BULK_STUDENT_UPLOAD`: processes inline `rows` when present; otherwise safely completes metadata-only upload tickets until the file parser adapter is added.
- `RESULT_BATCH_VALIDATION`: creates the draft result batch and academic records in the background.
- `WEBHOOK_DELIVERY`, `PUSH_NOTIFICATION`, and `SMS_EMAIL_DELIVERY`: have durable placeholder processors that update records without blocking product requests.
- Other integrations use deferred adapter results until their provider-specific handlers are implemented.

Next worker step:

- Add real file parser adapters, real notification transports, and signed webhook delivery transports.
