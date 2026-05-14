import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { JobWorkerService } from "../apps/api/dist/apps/api/src/modules/jobs/job-worker.service.js";
import { PaystackWebhookService } from "../apps/api/dist/apps/api/src/modules/payments/paystack-webhook.service.js";

test("paystack webhook verifies signature and enqueues record request payment job", async () => {
  const previousSecret = process.env.PAYSTACK_SECRET_KEY;
  process.env.PAYSTACK_SECRET_KEY = "sk_test_acadid_paystack";

  const payload = {
    event: "charge.success",
    data: {
      id: 98765,
      reference: "ps_ref_001",
      amount: 250000,
      currency: "NGN",
      status: "success",
      paid_at: "2026-05-14T09:00:00.000Z",
      metadata: {
        requestId: "ARR-0001"
      },
      customer: {
        email: "student@example.com"
      }
    }
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  let enqueued;

  const service = new PaystackWebhookService(
    {
      recordRequest: {
        findUnique: async ({ where }) =>
          where.requestId === "ARR-0001"
            ? { uuid: "11111111-1111-4111-8111-111111111111", requestId: "ARR-0001", institutionId: "22222222-2222-4222-8222-222222222222" }
            : null,
        findFirst: async () => null
      }
    },
    {
      enqueueJob: async (input) => {
        enqueued = input;
        return { jobId: "job-paystack-1", pollingUrl: "/jobs/job-paystack-1" };
      }
    }
  );

  const result = await service.receiveWebhook({ payload, rawBody, signature });

  assert.equal(result.accepted, true);
  assert.equal(result.jobId, "job-paystack-1");
  assert.equal(enqueued.type, "PAYSTACK_PAYMENT_CONFIRMATION");
  assert.equal(enqueued.institutionId, "22222222-2222-4222-8222-222222222222");
  assert.equal(enqueued.relatedEntityId, "11111111-1111-4111-8111-111111111111");
  assert.equal(enqueued.payload.reference, "ps_ref_001");
  assert.equal(enqueued.payload.amountMinor, 250000);
  assert.equal(enqueued.idempotencyScope, "webhook:paystack");

  if (previousSecret === undefined) {
    delete process.env.PAYSTACK_SECRET_KEY;
  } else {
    process.env.PAYSTACK_SECRET_KEY = previousSecret;
  }
});

test("worker confirms Paystack record request payment and writes audit event", async () => {
  const calls = [];
  const service = new JobWorkerService(
    {
      recordRequest: {
        findUnique: async ({ where }) =>
          where.uuid === "11111111-1111-4111-8111-111111111111"
            ? {
                uuid: "11111111-1111-4111-8111-111111111111",
                requestId: "ARR-0001",
                institutionId: "22222222-2222-4222-8222-222222222222",
                status: "AWAITING_PAYMENT",
                paymentStatus: "PENDING",
                escrowStatus: "NONE",
                paymentReference: null,
                amountMinor: 250000,
                currency: "NGN",
                notes: []
              }
            : null,
        findFirst: async () => null
      },
      $transaction: async (callback) =>
        callback({
          $queryRaw: async () => [{ uuid: "job-paystack-1" }],
          backgroundJob: {
            update: async ({ where, data, select }) => {
              calls.push({ table: "BackgroundJob", where, data });
              if (select) {
                return {
                  uuid: "job-paystack-1",
                  type: "PAYSTACK_PAYMENT_CONFIRMATION",
                  queue: "payments.paystack",
                  institutionId: "22222222-2222-4222-8222-222222222222",
                  createdById: null,
                  payload: {
                    event: "charge.success",
                    status: "success",
                    reference: "ps_ref_001",
                    amountMinor: 250000,
                    currency: "NGN",
                    paidAt: "2026-05-14T09:00:00.000Z",
                    recordRequestId: "11111111-1111-4111-8111-111111111111"
                  },
                  attempts: 1,
                  maxAttempts: 10
                };
              }
              return { uuid: where.uuid };
            }
          },
          recordRequest: {
            update: async ({ where, data }) => {
              calls.push({ table: "RecordRequest", where, data });
              return {
                uuid: where.uuid,
                requestId: "ARR-0001",
                institutionId: "22222222-2222-4222-8222-222222222222",
                status: data.status,
                paymentStatus: data.paymentStatus,
                escrowStatus: data.escrowStatus,
                amountMinor: data.amountMinor,
                currency: data.currency,
                paymentReference: data.paymentReference
              };
            }
          },
          auditEvent: {
            create: async ({ data }) => {
              calls.push({ table: "AuditEvent", data });
              return { uuid: "audit-1", ...data };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              calls.push({ table: "DomainEvent", data });
              return { uuid: "event-1", ...data };
            }
          }
        })
    },
    {},
    {}
  );

  const result = await service.runOnce("worker-paystack-test", 1);
  const requestUpdate = calls.find((entry) => entry.table === "RecordRequest");
  const auditEvent = calls.find((entry) => entry.table === "AuditEvent");

  assert.deepEqual(result, { processed: 1, succeeded: 1, failed: 0 });
  assert.equal(requestUpdate.data.status, "SUBMITTED");
  assert.equal(requestUpdate.data.paymentStatus, "PAID");
  assert.equal(requestUpdate.data.escrowStatus, "HELD");
  assert.equal(requestUpdate.data.paymentReference, "ps_ref_001");
  assert.equal(auditEvent.data.action, "record_request.payment_confirmed");
  assert.equal(calls.some((entry) => entry.table === "DomainEvent" && entry.data.type === "paystack_payment_confirmation.succeeded"), true);
});
