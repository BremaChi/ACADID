# Notification Transports Runbook

AcadID sends notification records from background workers. Product teams should enqueue notifications; they should not call provider APIs directly from frontend or portal code.

## Supported Channels

- `EMAIL`: Resend or SendGrid.
- `SMS`: Termii or Twilio.
- `PUSH`: Expo push notifications.

## Environment

Email:

- `ACADID_EMAIL_FROM`
- `RESEND_API_KEY`
- `SENDGRID_API_KEY`

SMS:

- `TERMII_API_KEY`
- `TERMII_SENDER_ID`
- `TERMII_CHANNEL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

Push:

- `EXPO_ACCESS_TOKEN` optional.

Safety:

- `ACADID_REQUIRE_NOTIFICATION_PROVIDER=false` allows safe local dry-run for email/SMS.
- Set `ACADID_REQUIRE_NOTIFICATION_PROVIDER=true` for production-like environments.
- `ACADID_NOTIFICATION_TIMEOUT_MS` caps provider request timeouts.

## Destination Rules

The worker resolves destinations from the notification payload first, then related records.

- Email: `payload.to`, `payload.email`, `payload.emailAddress`, user email, or learner user email.
- SMS: `payload.to`, `payload.phone`, `payload.phoneNumber`, user phone, or learner phone.
- Push: `payload.to`, `payload.pushToken`, `payload.deviceToken`, or `payload.expoPushToken`.

## Operational Notes

- Failed provider calls mark the `Notification` as `FAILED` with the error stored on the record.
- Email/SMS dry-run marks the record as `SENT` only for local/pilot environments where provider enforcement is disabled.
- Webhook-style notifications should use `WebhookDelivery`, not `Notification`.
