import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthTokenPayload } from "../../auth/types.js";
import { PrismaService } from "./prisma.service.js";

type IdempotencyInput<Response> = {
  scope: string;
  key: string;
  operation: string;
  request: unknown;
  auth?: AuthTokenPayload;
  institutionId?: string;
  ttlHours?: number;
  handler: () => Promise<Response>;
  responseJobId?: (response: Response) => string | undefined;
};

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  keyFromHeaders(headers: Record<string, string | string[] | undefined>) {
    const value = headers["x-idempotency-key"] ?? headers["idempotency-key"];
    const raw = Array.isArray(value) ? value[0] : value;
    return raw?.trim() || undefined;
  }

  async execute<Response extends Prisma.InputJsonValue | Record<string, unknown>>(input: IdempotencyInput<Response>): Promise<Response> {
    const key = this.normaliseKey(input.key);
    const keyHash = this.hash(key);
    const requestHash = this.hash(this.stableStringify(input.request));
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: {
        scope_keyHash: {
          scope: input.scope,
          keyHash
        }
      }
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new BadRequestException("Idempotency key was already used with a different request payload.");
      }
      if (existing.response) {
        return existing.response as Response;
      }
      if (existing.status === "IN_PROGRESS") {
        throw new ConflictException("An idempotent request with this key is still processing.");
      }
      throw new ConflictException("An idempotent request with this key previously failed. Use a new key after resolving the error.");
    }

    const record = await this.createRecord(input, keyHash, requestHash);
    try {
      const response = await input.handler();
      await this.prisma.idempotencyRecord.update({
        where: { uuid: record.uuid },
        data: {
          status: "SUCCEEDED",
          response: this.toJson(response),
          jobId: input.responseJobId?.(response),
          error: null
        }
      });
      return response;
    } catch (error) {
      await this.prisma.idempotencyRecord.update({
        where: { uuid: record.uuid },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000)
        }
      });
      throw error;
    }
  }

  private async createRecord<Response>(input: IdempotencyInput<Response>, keyHash: string, requestHash: string) {
    try {
      return await this.prisma.idempotencyRecord.create({
        data: {
          scope: input.scope,
          keyHash,
          requestHash,
          operation: input.operation,
          actorType: input.auth?.kind ?? null,
          actorUserId: input.auth?.kind === "API_KEY" ? null : input.auth?.sub,
          clientId: input.auth?.clientId,
          institutionId: input.institutionId ?? input.auth?.institutionUuid,
          expiresAt: new Date(Date.now() + this.clampHours(input.ttlHours) * 60 * 60 * 1000)
        }
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException("An idempotent request with this key is already being recorded.");
      }
      throw error;
    }
  }

  private normaliseKey(key: string) {
    const trimmed = key.trim();
    if (trimmed.length < 8 || trimmed.length > 200) {
      throw new BadRequestException("Idempotency key must be between 8 and 200 characters.");
    }
    if (!/^[a-zA-Z0-9._:-]+$/.test(trimmed)) {
      throw new BadRequestException("Idempotency key may only contain letters, numbers, dots, underscores, colons, and hyphens.");
    }
    return trimmed;
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(",")}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${this.stableStringify(entry)}`).join(",")}}`;
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private clampHours(value: number | undefined) {
    if (typeof value !== "number" || !Number.isFinite(value)) return 24;
    return Math.min(24 * 30, Math.max(1, Math.floor(value)));
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
