import assert from "node:assert/strict";
import test from "node:test";
import { NotificationDeliveryService } from "../apps/api/dist/apps/api/src/modules/platform/services/notification-delivery.service.js";

test("notification delivery sends email through Resend when configured", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re_test_key";
  const updates = [];
  let fetchCall;
  globalThis.fetch = async (url, init) => {
    fetchCall = { url, init };
    return { ok: true, status: 202, text: async () => "" };
  };

  try {
    const service = new NotificationDeliveryService({
      notification: {
        findMany: async () => [
          {
            uuid: "notification-1",
            channel: "EMAIL",
            type: "record_request.updated",
            title: "Record request updated",
            body: "Your record request has moved forward.",
            payload: {},
            user: { email: "student@example.com", phone: null, fullName: "Ada Student" },
            learner: null
          }
        ],
        update: async ({ where, data }) => {
          updates.push({ where, data });
          return { uuid: where.uuid, ...data };
        }
      }
    });

    const result = await service.deliverPendingForJob("job-1");

    assert.equal(result.delivered, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.providers[0], "resend");
    assert.equal(fetchCall.url, "https://api.resend.com/emails");
    assert.equal(fetchCall.init.headers.authorization, "Bearer re_test_key");
    assert.equal(JSON.parse(fetchCall.init.body).to[0], "student@example.com");
    assert.equal(updates[0].data.status, "SENT");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});

test("notification delivery uses safe dry-run when SMS provider is not configured", async () => {
  const previousRequire = process.env.ACADID_REQUIRE_NOTIFICATION_PROVIDER;
  const previousTermii = process.env.TERMII_API_KEY;
  const previousTwilioSid = process.env.TWILIO_ACCOUNT_SID;
  process.env.ACADID_REQUIRE_NOTIFICATION_PROVIDER = "false";
  delete process.env.TERMII_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  const updates = [];

  try {
    const service = new NotificationDeliveryService({
      notification: {
        findMany: async () => [
          {
            uuid: "notification-2",
            channel: "SMS",
            type: "result.published",
            title: "Result published",
            body: "Your result has been published.",
            payload: { phone: "+2348000000000" },
            user: null,
            learner: null
          }
        ],
        update: async ({ where, data }) => {
          updates.push({ where, data });
          return { uuid: where.uuid, ...data };
        }
      }
    });

    const result = await service.deliverPendingForJob("job-2");

    assert.equal(result.delivered, 1);
    assert.equal(result.dryRun, 1);
    assert.equal(result.providers[0], "dry-run-sms");
    assert.equal(updates[0].data.status, "SENT");
  } finally {
    if (previousRequire === undefined) delete process.env.ACADID_REQUIRE_NOTIFICATION_PROVIDER;
    else process.env.ACADID_REQUIRE_NOTIFICATION_PROVIDER = previousRequire;
    if (previousTermii === undefined) delete process.env.TERMII_API_KEY;
    else process.env.TERMII_API_KEY = previousTermii;
    if (previousTwilioSid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
    else process.env.TWILIO_ACCOUNT_SID = previousTwilioSid;
  }
});
