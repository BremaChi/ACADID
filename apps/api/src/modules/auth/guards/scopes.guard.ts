import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import type { AuthenticatedRequest } from "../types.js";
import { requiredScopesMetadataKey } from "../scopes.decorator.js";

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(requiredScopesMetadataKey, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!requiredScopes?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth.role === UserRole.ACADID_SUPER_ADMIN) {
      return true;
    }

    const grantedScopes = new Set(request.auth.kind === "API_KEY" ? request.auth.scopes ?? [] : request.auth.permissions ?? []);
    const allowed = requiredScopes.every((scope) => grantedScopes.has(scope) || grantedScopes.has("*"));
    if (!allowed) {
      throw new ForbiddenException("Authenticated actor scope does not allow this operation.");
    }

    return true;
  }
}
