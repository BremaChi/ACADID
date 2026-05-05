import type { UserRole } from "@prisma/client";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  fullName: string;
  role: UserRole;
  kind?: "USER" | "API_KEY";
  learnerId?: string;
  institutionId?: string;
  institutionUuid?: string;
  institutionName?: string;
  institutionUserId?: string;
  permissions?: string[];
  sessionId?: string;
  apiKeyId?: string;
  apiKeyOwnerType?: "PRODUCT" | "INSTITUTION";
  productCode?: string;
  productName?: string;
  scopes?: string[];
  environment?: "SANDBOX" | "PRODUCTION";
  rateLimitPerMinute?: number;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  auth: AuthTokenPayload;
}
