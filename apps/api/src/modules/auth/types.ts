import type { UserRole } from "@prisma/client";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  fullName: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  auth: AuthTokenPayload;
}
