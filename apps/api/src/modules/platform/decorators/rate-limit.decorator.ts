import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_POLICY = "acadid:rate-limit-policy";

export type RateLimitKeyStrategy = "ip" | "auth" | "ip_and_body";

export type RateLimitPolicy = {
  scope: string;
  limit: number;
  windowSeconds?: number;
  key?: RateLimitKeyStrategy;
  bodyField?: string;
};

export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_POLICY, policy);
