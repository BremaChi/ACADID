# AcadID Webhook Contracts

Status: Active  
Owner: Core Platform Team  
Last updated: 2026-05-19

## Webhook Principles

Webhooks are infrastructure contracts. They must be signed, idempotent, auditable, and retried through background workers.

Any webhook contract change must update this document and the relevant detailed contract before another team depends on it.

## Inbound Webhooks

Current inbound webhook:

- `POST /api/webhooks/paystack`

Rules:

- Verify provider signature before accepting.
- Return quickly after validation and enqueue background work.
- Use idempotency protection for payment events.
- Do not perform long payment-confirmation work inside the HTTP request.
- See `docs/api/paystack-webhook-contract.md`.

## Outbound Webhooks

Founder-managed institution webhook endpoints support:

- Endpoint creation.
- One-time secret display.
- Secret rotation.
- Suspension/reactivation.
- Delivery logs.
- Retry.
- Replay.

Delivery rules:

- Signed payloads.
- Timestamp headers.
- Idempotency keys.
- Exponential backoff.
- Dead-letter handling.
- Delivery logs.
- Audit events for retry/replay/security actions.

Detailed receiver expectations:

- `docs/api/webhook-receiver-contract.md`

## Background Delivery

Webhook delivery must use the queue/worker system:

- `BackgroundJob`
- `DomainEvent`
- `WebhookDelivery`
- `WorkerHeartbeat`
- Dead-letter review from Founder Console.

Never block a user-facing request while waiting for a partner endpoint.

## Pending Webhook Areas

- External exam body integrations.
- Live Results API callbacks.
- Employer/developer integrations.
- Student notification webhooks, if approved later.

