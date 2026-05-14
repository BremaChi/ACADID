import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { BackgroundJobType, Prisma } from "@prisma/client";
import { PrismaService } from "../platform/services/prisma.service.js";
import { QueueService } from "../platform/services/queue.service.js";

type PaystackWebhookInput = {
  payload: unknown;
  rawBody?: Buffer | string;
  signature?: string;
};

@Injectable()
export class PaystackWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService
  ) {}

  async receiveWebhook(input: PaystackWebhookInput) {
    this.assertValidSignature(input);

    const payload = this.asRecord(input.payload);
    const event = this.asString(payload.event);
    if (!event) {
      throw new BadRequestException("Paystack webhook event is required.");
    }

    const data = this.asRecord(payload.data);
    const reference = this.asString(data.reference);
    const amountMinor = this.asPositiveInteger(data.amount);
    const currency = this.asString(data.currency)?.toUpperCase() ?? "NGN";
    const status = this.asString(data.status);
    const paidAt = this.asString(data.paid_at) ?? this.asString(data.paidAt) ?? this.asString(data.created_at);
    const metadata = this.extractMetadata(data.metadata);

    if (event !== "charge.success") {
      return {
        accepted: true,
        ignored: true,
        event,
        reason: "Only charge.success events change AcadID record request payment state."
      };
    }

    if (!reference) {
      throw new BadRequestException("Paystack charge.success webhook requires a transaction reference.");
    }
    if (!amountMinor) {
      throw new BadRequestException("Paystack charge.success webhook requires a positive amount.");
    }

    const recordRequest = await this.findRecordRequest({
      recordRequestId: metadata.recordRequestId ?? metadata.record_request_id ?? metadata.recordRequestUuid,
      requestId: metadata.requestId ?? metadata.request_id,
      reference
    });

    const eventId = this.asString(payload.id) ?? this.asString(data.id) ?? reference;
    const job = await this.queue.enqueueJob({
      type: BackgroundJobType.PAYSTACK_PAYMENT_CONFIRMATION,
      institutionId: recordRequest?.institutionId ?? undefined,
      relatedEntityType: "RecordRequest",
      relatedEntityId: recordRequest?.uuid,
      priority: 4,
      payload: this.toJson({
        provider: "PAYSTACK",
        event,
        eventId,
        reference,
        status,
        amountMinor,
        currency,
        paidAt,
        customerEmail: this.asString(this.asRecord(data.customer).email),
        recordRequestId: recordRequest?.uuid ?? metadata.recordRequestId ?? metadata.record_request_id ?? null,
        requestId: recordRequest?.requestId ?? metadata.requestId ?? metadata.request_id ?? null,
        metadata,
        receivedAt: new Date().toISOString()
      }),
      eventType: "paystack.payment.webhook_received",
      eventPayload: this.toJson({
        event,
        reference,
        amountMinor,
        currency,
        recordRequestId: recordRequest?.uuid ?? null,
        requestId: recordRequest?.requestId ?? null
      }),
      idempotencyScope: "webhook:paystack",
      idempotencyKey: `${event}:${eventId}:${reference}`,
      idempotencyTtlHours: 24 * 31
    });

    return {
      accepted: true,
      event,
      reference,
      recordRequestId: recordRequest?.uuid ?? null,
      requestId: recordRequest?.requestId ?? null,
      jobId: job.jobId,
      pollingUrl: job.pollingUrl
    };
  }

  private assertValidSignature(input: PaystackWebhookInput) {
    const secret = process.env.PAYSTACK_SECRET_KEY ?? process.env.PAYSTACK_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException("Paystack webhook secret is not configured.");
    }
    if (!input.signature) {
      throw new UnauthorizedException("Paystack webhook signature is required.");
    }

    const body = Buffer.isBuffer(input.rawBody)
      ? input.rawBody
      : typeof input.rawBody === "string"
        ? Buffer.from(input.rawBody)
        : Buffer.from(JSON.stringify(input.payload ?? {}));
    const expected = createHmac("sha512", secret).update(body).digest("hex");
    if (!this.secureEqual(input.signature, expected)) {
      throw new UnauthorizedException("Invalid Paystack webhook signature.");
    }
  }

  private async findRecordRequest(input: { recordRequestId?: string; requestId?: string; reference: string }) {
    const recordRequestId = this.asString(input.recordRequestId);
    if (recordRequestId && this.isUuid(recordRequestId)) {
      const request = await this.prisma.recordRequest.findUnique({
        where: { uuid: recordRequestId },
        select: { uuid: true, requestId: true, institutionId: true }
      });
      if (request) return request;
    }

    const requestId = this.asString(input.requestId);
    if (requestId) {
      const request = await this.prisma.recordRequest.findUnique({
        where: { requestId },
        select: { uuid: true, requestId: true, institutionId: true }
      });
      if (request) return request;
    }

    return this.prisma.recordRequest.findFirst({
      where: {
        OR: [{ paymentReference: input.reference }, { requestId: input.reference }]
      },
      select: { uuid: true, requestId: true, institutionId: true }
    });
  }

  private extractMetadata(value: unknown): Record<string, string> {
    const metadata = typeof value === "string" ? this.parseJsonRecord(value) : this.asRecord(value);
    const output: Record<string, string> = {};
    for (const [key, entry] of Object.entries(metadata)) {
      const text = this.asString(entry);
      if (text) output[key] = text;
    }
    return output;
  }

  private parseJsonRecord(value: string) {
    try {
      return this.asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }

  private secureEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private asString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private asPositiveInteger(value: unknown): number | undefined {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed);
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
