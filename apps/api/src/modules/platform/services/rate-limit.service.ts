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
  auth?: {
    sub?: string;
    kind?: string;
    apiKeyId?: string;
    clientId?: string;
    institutionId?: string;
    institutionUuid?: string;
    apiKeyOwnerType?: "PRODUCT" | "INSTITUTION";
    productCode?: string;
    rateLimitPerMinute?: number;
  };
};

type CleanupInput = {
  olderThanHours?: number;
};

type RateLimitPolicyControl = {
  emergency: {
    enabled: boolean;
    limitPerMinute: number;
    reason: string | null;
  };
  productDefaultsPerMinute: Record<string, number>;
  institutionDefaultsPerMinute: {
    sandbox: number;
    production: number;
  };
  institutionOverridesPerMinute: Record<string, number>;
  scopeOverrides: Record<string, { limit: number; windowSeconds: number }>;
};

export const defaultRateLimitPolicyControl: RateLimitPolicyControl = {
  emergency: {
    enabled: false,
    limitPerMinute: 60,
    reason: null
  },
  productDefaultsPerMinute: {
    INSTITUTION_PORTAL: 1000,
    STUDENT_APP: 2000,
    EMPLOYER_VERIFICATION_PORTAL: 1500,
    EXAM_BODY_API: 2000
  },
  institutionDefaultsPerMinute: {
    sandbox: 500,
    production: 2000
  },
  institutionOverridesPerMinute: {},
  scopeOverrides: {}
};

@Injectable()
export class RateLimitService {
  private policyCache: { value: RateLimitPolicyControl; expiresAt: number } | null = null;

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

  async assertRequestAllowed(request: RateLimitRequest, policy: RateLimitPolicy) {
    const effective = await this.effectiveRequestPolicy(request, policy);
    return this.assertAllowed({
      scope: effective.scope,
      key: this.keyForRequest(request, policy),
      limit: effective.limit,
      windowSeconds: effective.windowSeconds
    });
  }

  async assertApiKeyAllowed(auth: NonNullable<RateLimitRequest["auth"]>) {
    if (auth.kind !== "API_KEY" || !auth.apiKeyId) {
      return null;
    }

    const policy = await this.readPolicyControl();
    const configuredLimit = this.apiKeyLimitFromPolicy(auth, policy);
    if (!configuredLimit) {
      return null;
    }

    return this.assertAllowed({
      scope: "api-key.global",
      key: `api-key:${auth.apiKeyId}`,
      limit: this.applyEmergencyCap(configuredLimit, policy),
      windowSeconds: 60
    });
  }

  async readBucketSummary(options: { recentHours?: number; staleAfterHours?: number } = {}) {
    const now = new Date();
    const recentHours = this.clampNumber(options.recentHours, 1, 168, 24);
    const staleAfterHours = this.clampNumber(options.staleAfterHours, 1, 720, 24);
    const recentSince = new Date(now.getTime() - recentHours * 60 * 60 * 1000);
    const staleBefore = new Date(now.getTime() - staleAfterHours * 60 * 60 * 1000);

    const [totalBuckets, recentBuckets, staleBuckets, totalRequests, recentRequests, topScopes] = await Promise.all([
      this.prisma.rateLimitBucket.count(),
      this.prisma.rateLimitBucket.count({ where: { windowStart: { gte: recentSince } } }),
      this.prisma.rateLimitBucket.count({ where: { windowStart: { lt: staleBefore } } }),
      this.prisma.rateLimitBucket.aggregate({ _sum: { count: true } }),
      this.prisma.rateLimitBucket.aggregate({ where: { windowStart: { gte: recentSince } }, _sum: { count: true } }),
      this.prisma.rateLimitBucket.groupBy({
        by: ["scope"],
        where: { windowStart: { gte: recentSince } },
        _count: { _all: true },
        _sum: { count: true },
        orderBy: { _sum: { count: "desc" } },
        take: 10
      })
    ]);

    return {
      generatedAt: now,
      recentHours,
      staleAfterHours,
      totalBuckets,
      recentBuckets,
      staleBuckets,
      totalRequests: totalRequests._sum.count ?? 0,
      recentRequests: recentRequests._sum.count ?? 0,
      topScopes: topScopes.map((scope) => ({
        scope: scope.scope,
        buckets: scope._count._all,
        requests: scope._sum.count ?? 0
      }))
    };
  }

  async cleanupExpiredBuckets(input: CleanupInput = {}) {
    const olderThanHours = this.clampNumber(input.olderThanHours, 1, 720, 24);
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const result = await this.prisma.rateLimitBucket.deleteMany({
      where: {
        windowStart: { lt: cutoff }
      }
    });

    return {
      cleanedAt: new Date(),
      cutoff,
      olderThanHours,
      deletedBuckets: result.count
    };
  }

  async readPolicyControl() {
    if (this.policyCache && this.policyCache.expiresAt > Date.now()) {
      return this.policyCache.value;
    }

    let stored: unknown;
    try {
      if ("platformSetting" in this.prisma && this.prisma.platformSetting?.findUnique) {
        const row = await this.prisma.platformSetting.findUnique({
          where: { key: "rateLimits" },
          select: { value: true }
        });
        stored = row?.value;
      }
    } catch {
      stored = undefined;
    }

    const value = this.normalisePolicyControl(stored);
    this.policyCache = {
      value,
      expiresAt: Date.now() + 15_000
    };
    return value;
  }

  clearPolicyCache() {
    this.policyCache = null;
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

  private async effectiveRequestPolicy(request: RateLimitRequest, policy: RateLimitPolicy) {
    const control = await this.readPolicyControl();
    const override = control.scopeOverrides[policy.scope];
    const configured = {
      scope: policy.scope,
      limit: override?.limit ?? policy.limit,
      windowSeconds: override?.windowSeconds ?? policy.windowSeconds ?? 60
    };

    return {
      ...configured,
      limit: this.applyEmergencyCap(configured.limit, control)
    };
  }

  private apiKeyLimitFromPolicy(auth: NonNullable<RateLimitRequest["auth"]>, policy: RateLimitPolicyControl) {
    if (auth.apiKeyOwnerType === "PRODUCT" && auth.productCode) {
      return policy.productDefaultsPerMinute[auth.productCode] ?? auth.rateLimitPerMinute;
    }

    const institutionOverride =
      (auth.institutionUuid ? policy.institutionOverridesPerMinute[auth.institutionUuid] : undefined) ??
      (auth.institutionId ? policy.institutionOverridesPerMinute[auth.institutionId] : undefined);
    if (institutionOverride) {
      return institutionOverride;
    }

    return auth.rateLimitPerMinute ?? policy.institutionDefaultsPerMinute.sandbox;
  }

  private applyEmergencyCap(limit: number, policy: RateLimitPolicyControl) {
    if (!policy.emergency.enabled) {
      return limit;
    }
    return Math.min(limit, policy.emergency.limitPerMinute);
  }

  private normalisePolicyControl(value: unknown): RateLimitPolicyControl {
    const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const emergencySource =
      source.emergency && typeof source.emergency === "object" && !Array.isArray(source.emergency)
        ? (source.emergency as Record<string, unknown>)
        : {};
    const institutionDefaults =
      source.institutionDefaultsPerMinute && typeof source.institutionDefaultsPerMinute === "object" && !Array.isArray(source.institutionDefaultsPerMinute)
        ? (source.institutionDefaultsPerMinute as Record<string, unknown>)
        : {};

    return {
      emergency: {
        enabled: emergencySource.enabled === true,
        limitPerMinute: this.clampNumber(this.asNumber(emergencySource.limitPerMinute), 1, 100_000, defaultRateLimitPolicyControl.emergency.limitPerMinute),
        reason: typeof emergencySource.reason === "string" && emergencySource.reason.trim() ? emergencySource.reason.trim().slice(0, 500) : null
      },
      productDefaultsPerMinute: this.normaliseNumberRecord(source.productDefaultsPerMinute, defaultRateLimitPolicyControl.productDefaultsPerMinute, 1, 100_000),
      institutionDefaultsPerMinute: {
        sandbox: this.clampNumber(this.asNumber(institutionDefaults.sandbox), 1, 100_000, defaultRateLimitPolicyControl.institutionDefaultsPerMinute.sandbox),
        production: this.clampNumber(this.asNumber(institutionDefaults.production), 1, 100_000, defaultRateLimitPolicyControl.institutionDefaultsPerMinute.production)
      },
      institutionOverridesPerMinute: this.normaliseNumberRecord(source.institutionOverridesPerMinute, {}, 1, 100_000),
      scopeOverrides: this.normaliseScopeOverrides(source.scopeOverrides)
    };
  }

  private normaliseNumberRecord(value: unknown, fallback: Record<string, number>, min: number, max: number) {
    const result = { ...fallback };
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return result;
    }

    for (const [key, raw] of Object.entries(value)) {
      const cleanKey = key.trim();
      if (!cleanKey) continue;
      result[cleanKey] = this.clampNumber(this.asNumber(raw), min, max, result[cleanKey] ?? fallback[cleanKey] ?? min);
    }
    return result;
  }

  private normaliseScopeOverrides(value: unknown) {
    const result: RateLimitPolicyControl["scopeOverrides"] = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return result;
    }

    for (const [scope, raw] of Object.entries(value)) {
      if (!scope.trim() || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const record = raw as Record<string, unknown>;
      result[scope.trim()] = {
        limit: this.clampNumber(this.asNumber(record.limit), 1, 100_000, 100),
        windowSeconds: this.clampNumber(this.asNumber(record.windowSeconds), 1, 3600, 60)
      };
    }
    return result;
  }

  private asNumber(value: unknown) {
    return typeof value === "number" ? value : typeof value === "string" ? Number(value) : undefined;
  }

  private clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(value)));
  }
}
