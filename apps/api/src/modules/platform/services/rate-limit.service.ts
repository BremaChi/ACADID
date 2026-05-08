import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import type { RateLimitPolicy } from "../decorators/rate-limit.decorator.js";

type RateLimitCheckInput = {
  scope: string;
  key: string;
  limit: number;
  windowSeconds?: number;
};

type RateLimitRequest = {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
  socket: { remoteAddress?: string };
  auth?: { sub?: string; kind?: string; apiKeyId?: string; clientId?: string; institutionUuid?: string };
};

@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(input: RateLimitCheckInput) {
    const windowSeconds = input.windowSeconds ?? 60;
    const now = new Date();
    const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
    const bucketKeyHash = this.hashKey(input.key);

    const bucket = await this.prisma.rateLimitBucket.upsert({
      where: {
        scope_bucketKeyHash_windowStart: {
          scope: input.scope,
          bucketKeyHash,
          windowStart
        }
      },
      update: {
        count: { increment: 1 },
        limit: input.limit,
        windowSeconds,
        lastRequestAt: now
      },
      create: {
        scope: input.scope,
        bucketKeyHash,
        windowStart,
        windowSeconds,
        count: 1,
        limit: input.limit,
        firstRequestAt: now,
        lastRequestAt: now
      },
      select: {
        count: true,
        limit: true,
        windowStart: true,
        windowSeconds: true
      }
    });

    const resetAt = new Date(bucket.windowStart.getTime() + bucket.windowSeconds * 1000);
    if (bucket.count > bucket.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Rate limit exceeded.",
          scope: input.scope,
          limit: bucket.limit,
          retryAfterSeconds,
          resetAt
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return {
      allowed: true,
      scope: input.scope,
      count: bucket.count,
      limit: bucket.limit,
      remaining: Math.max(0, bucket.limit - bucket.count),
      resetAt
    };
  }

  keyForRequest(request: RateLimitRequest, policy: RateLimitPolicy) {
    const strategy = policy.key ?? "ip";
    if (strategy === "auth") {
      if (request.auth?.apiKeyId) return `api-key:${request.auth.apiKeyId}`;
      if (request.auth?.sub) return `user:${request.auth.sub}`;
      return `ip:${this.ipAddress(request)}`;
    }

    if (strategy === "ip_and_body") {
      const bodyValue = policy.bodyField ? this.readBodyField(request.body, policy.bodyField) : "";
      return `ip-body:${this.ipAddress(request)}:${bodyValue || "none"}`;
    }

    return `ip:${this.ipAddress(request)}`;
  }

  ipAddress(request: RateLimitRequest) {
    const forwarded = this.firstHeader(request.headers["x-forwarded-for"])?.split(",")[0]?.trim();
    return forwarded || this.firstHeader(request.headers["x-real-ip"]) || request.ip || request.socket.remoteAddress || "unknown";
  }

  private readBodyField(body: unknown, field: string) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "";
    const value = (body as Record<string, unknown>)[field];
    return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
  }

  private firstHeader(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }

  private hashKey(key: string) {
    return createHash("sha256").update(key).digest("hex");
  }
}
