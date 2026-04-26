import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { TokenService } from "../token.service.js";
import type { AuthenticatedRequest } from "../types.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const authorization = Array.isArray(header) ? header[0] : header;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    request.auth = this.tokenService.verify(token);
    return true;
  }
}
