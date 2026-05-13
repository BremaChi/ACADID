import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RATE_LIMIT_POLICY, type RateLimitPolicy } from "../decorators/rate-limit.decorator.js";
import { RateLimitService } from "../services/rate-limit.service.js";

type RateLimitedRequest = {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
  socket: { remoteAddress?: string };
  auth?: { sub?: string; kind?: string; apiKeyId?: string; clientId?: string; institutionUuid?: string };
};

type RateLimitedResponse = {
  setHeader?: (name: string, value: string | number) => void;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy | undefined>(RATE_LIMIT_POLICY, [context.getHandler(), context.getClass()]);
    if (!policy) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitedRequest>();
    const response = http.getResponse<RateLimitedResponse>();
    const result = await this.rateLimit.assertRequestAllowed(request, policy);

    response.setHeader?.("X-RateLimit-Limit", result.limit);
    response.setHeader?.("X-RateLimit-Remaining", result.remaining);
    response.setHeader?.("X-RateLimit-Reset", result.resetAt.toISOString());
    return true;
  }
}
