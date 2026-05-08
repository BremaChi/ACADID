import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { RateLimitService } from "../../platform/services/rate-limit.service.js";
import { TokenService } from "../token.service.js";
import type { AuthenticatedRequest } from "../types.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly rateLimit: RateLimitService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const authorization = Array.isArray(header) ? header[0] : header;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    request.auth = this.tokenService.verify(token);
    await this.enforceApiKeyRateLimit(request.auth);
    return true;
  }

  private async enforceApiKeyRateLimit(auth: AuthenticatedRequest["auth"]) {
    if (auth.kind !== "API_KEY" || !auth.apiKeyId || !auth.rateLimitPerMinute) {
      return;
    }

    await this.rateLimit.assertAllowed({
      scope: "api-key.global",
      key: `api-key:${auth.apiKeyId}`,
      limit: auth.rateLimitPerMinute,
      windowSeconds: 60
    });
  }
}
