import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { TokenService } from "../token.service.js";
import type { AuthenticatedRequest } from "../types.js";

const requestWindows = new Map<string, { windowStart: number; count: number }>();

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const authorization = Array.isArray(header) ? header[0] : header;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    request.auth = this.tokenService.verify(token);
    this.enforceApiKeyRateLimit(request.auth);
    return true;
  }

  private enforceApiKeyRateLimit(auth: AuthenticatedRequest["auth"]) {
    if (auth.kind !== "API_KEY" || !auth.apiKeyId || !auth.rateLimitPerMinute) {
      return;
    }

    const currentWindow = Math.floor(Date.now() / 60000) * 60000;
    const existing = requestWindows.get(auth.apiKeyId);
    if (!existing || existing.windowStart !== currentWindow) {
      requestWindows.set(auth.apiKeyId, { windowStart: currentWindow, count: 1 });
      return;
    }

    existing.count += 1;
    if (existing.count > auth.rateLimitPerMinute) {
      throw new HttpException("API key rate limit exceeded.", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
