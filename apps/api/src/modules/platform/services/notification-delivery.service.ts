import { Injectable } from "@nestjs/common";
import { NotificationChannel, Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service.js";

type NotificationRecord = {
  uuid: string;
  channel: NotificationChannel;
  type: string;
  title: string;
  body: string;
  payload: Prisma.JsonValue;
  user: { email: string; phone: string | null; fullName: string } | null;
  learner: { phone: string | null; fullName: string; studentUserProfile: { email: string } | null } | null;
};

type DeliveryResult = {
  id: string;
  channel: NotificationChannel;
  provider: string;
  dryRun: boolean;
  status: "SENT" | "FAILED";
  destination: string | null;
  error?: string;
};

@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async deliverPendingForJob(jobId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { jobId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        uuid: true,
        channel: true,
        type: true,
        title: true,
        body: true,
        payload: true,
        user: {
          select: {
            email: true,
            phone: true,
            fullName: true
          }
        },
        learner: {
          select: {
            phone: true,
            fullName: true,
            studentUserProfile: {
              select: {
                email: true
              }
            }
          }
        }
      }
    });

    const results: DeliveryResult[] = [];
    for (const notification of notifications) {
      const result = await this.deliverOne(notification);
      results.push(result);
    }

    const delivered = results.filter((result) => result.status === "SENT").length;
    const failed = results.length - delivered;
    return {
      mode: "notification_delivery",
      processed: results.length,
      delivered,
      failed,
      dryRun: results.filter((result) => result.dryRun).length,
      providers: Array.from(new Set(results.map((result) => result.provider))),
      results
    };
  }

  private async deliverOne(notification: NotificationRecord): Promise<DeliveryResult> {
    try {
      const result = await this.send(notification);
      await this.prisma.notification.update({
        where: { uuid: notification.uuid },
        data: {
          status: "SENT",
          sentAt: new Date(),
          failedAt: null,
          error: null
        }
      });
      return { id: notification.uuid, channel: notification.channel, status: "SENT", ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.notification.update({
        where: { uuid: notification.uuid },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          error: message.slice(0, 1000)
        }
      });
      return {
        id: notification.uuid,
        channel: notification.channel,
        status: "FAILED",
        provider: "none",
        dryRun: false,
        destination: null,
        error: message
      };
    }
  }

  private async send(notification: NotificationRecord) {
    if (notification.channel === "EMAIL") {
      return this.sendEmail(notification);
    }
    if (notification.channel === "SMS") {
      return this.sendSms(notification);
    }
    if (notification.channel === "PUSH") {
      return this.sendPush(notification);
    }
    throw new Error("Webhook notifications must use the WebhookDelivery queue.");
  }

  private async sendEmail(notification: NotificationRecord) {
    const payload = this.asRecord(notification.payload);
    const to = this.firstString(payload.to, payload.email, payload.emailAddress) ?? notification.user?.email ?? notification.learner?.studentUserProfile?.email;
    if (!to) {
      throw new Error("Email notification requires a destination email.");
    }

    const from = this.firstString(payload.from) ?? process.env.ACADID_EMAIL_FROM ?? "ACAD.ID <no-reply@acadid.local>";
    if (process.env.RESEND_API_KEY) {
      await this.postJson(
        "https://api.resend.com/emails",
        {
          from,
          to: [to],
          subject: notification.title,
          text: notification.body
        },
        {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`
        }
      );
      return { provider: "resend", dryRun: false, destination: to };
    }

    if (process.env.SENDGRID_API_KEY) {
      await this.postJson(
        "https://api.sendgrid.com/v3/mail/send",
        {
          personalizations: [{ to: [{ email: to }] }],
          from: { email: this.emailAddress(from) },
          subject: notification.title,
          content: [{ type: "text/plain", value: notification.body }]
        },
        {
          authorization: `Bearer ${process.env.SENDGRID_API_KEY}`
        }
      );
      return { provider: "sendgrid", dryRun: false, destination: to };
    }

    this.requireProviderOrDryRun("email");
    return { provider: "dry-run-email", dryRun: true, destination: to };
  }

  private async sendSms(notification: NotificationRecord) {
    const payload = this.asRecord(notification.payload);
    const to = this.firstString(payload.to, payload.phone, payload.phoneNumber) ?? notification.user?.phone ?? notification.learner?.phone;
    if (!to) {
      throw new Error("SMS notification requires a destination phone number.");
    }

    if (process.env.TERMII_API_KEY) {
      await this.postJson("https://api.ng.termii.com/api/sms/send", {
        api_key: process.env.TERMII_API_KEY,
        to,
        from: process.env.TERMII_SENDER_ID ?? process.env.ACADID_SMS_SENDER_ID ?? "ACADID",
        sms: notification.body,
        type: "plain",
        channel: process.env.TERMII_CHANNEL ?? "generic"
      });
      return { provider: "termii", dryRun: false, destination: to };
    }

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
      const basic = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      await this.postForm(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        To: to,
        From: process.env.TWILIO_FROM_NUMBER,
        Body: notification.body
      }, {
        authorization: `Basic ${basic}`
      });
      return { provider: "twilio", dryRun: false, destination: to };
    }

    this.requireProviderOrDryRun("sms");
    return { provider: "dry-run-sms", dryRun: true, destination: to };
  }

  private async sendPush(notification: NotificationRecord) {
    const payload = this.asRecord(notification.payload);
    const to = this.firstString(payload.to, payload.pushToken, payload.deviceToken, payload.expoPushToken);
    if (!to) {
      throw new Error("Push notification requires a destination push token.");
    }

    await this.postJson(
      "https://exp.host/--/api/v2/push/send",
      {
        to,
        title: notification.title,
        body: notification.body,
        data: {
          type: notification.type,
          ...(this.asRecord(payload.data))
        }
      },
      {
        ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {})
      }
    );
    return { provider: "expo", dryRun: false, destination: to };
  }

  private async postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs())
    });
    await this.assertOk(response);
  }

  private async postForm(url: string, body: Record<string, string>, headers: Record<string, string> = {}) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers
      },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(this.timeoutMs())
    });
    await this.assertOk(response);
  }

  private async assertOk(response: Response) {
    if (response.ok) return;
    const text = await response.text().catch(() => "");
    throw new Error(`Notification provider failed with HTTP ${response.status}${text ? `: ${text.slice(0, 500)}` : ""}`);
  }

  private requireProviderOrDryRun(channel: string) {
    if (process.env.ACADID_REQUIRE_NOTIFICATION_PROVIDER === "true") {
      throw new Error(`${channel} notification provider is not configured.`);
    }
  }

  private timeoutMs() {
    const configured = Number(process.env.ACADID_NOTIFICATION_TIMEOUT_MS ?? "10000");
    return Number.isFinite(configured) ? Math.min(30000, Math.max(1000, configured)) : 10000;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private firstString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private emailAddress(value: string) {
    const match = value.match(/<([^>]+)>/);
    return match?.[1] ?? value;
  }
}
