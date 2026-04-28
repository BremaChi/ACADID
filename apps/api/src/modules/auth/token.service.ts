import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthTokenPayload } from "./types.js";

const defaultTokenTtlSeconds = 60 * 60 * 8;
const productionApiTokenTtlSeconds = 60 * 60;
const sandboxApiTokenTtlSeconds = 60 * 60 * 24;

@Injectable()
export class TokenService {
  sign(payload: Omit<AuthTokenPayload, "iat" | "exp">, ttlSeconds = defaultTokenTtlSeconds): string {
    const now = Math.floor(Date.now() / 1000);
    const tokenPayload: AuthTokenPayload = {
      ...payload,
      iat: now,
      exp: now + ttlSeconds
    };

    const encodedHeader = this.encode({ alg: "HS256", typ: "JWT" });
    const encodedPayload = this.encode(tokenPayload);
    const signature = this.signature(`${encodedHeader}.${encodedPayload}`);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  signApiClient(payload: Omit<AuthTokenPayload, "iat" | "exp">): string {
    const ttlSeconds =
      payload.environment === "PRODUCTION" ? productionApiTokenTtlSeconds : sandboxApiTokenTtlSeconds;
    return this.sign(payload, ttlSeconds);
  }

  verify(token: string): AuthTokenPayload {
    const [encodedHeader, encodedPayload, signature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException("Invalid bearer token.");
    }

    const expected = this.signature(`${encodedHeader}.${encodedPayload}`);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new UnauthorizedException("Invalid bearer token.");
    }

    let payload: AuthTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AuthTokenPayload;
    } catch {
      throw new UnauthorizedException("Invalid bearer token.");
    }

    if (!payload.sub || !payload.email || !payload.role || !payload.exp) {
      throw new UnauthorizedException("Invalid bearer token.");
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("Bearer token expired.");
    }

    return payload;
  }

  private encode(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
  }

  private signature(value: string): string {
    return createHmac("sha256", this.secret()).update(value).digest("base64url");
  }

  private secret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === "replace-with-local-development-secret") {
      return "local-development-secret-change-before-pilot";
    }
    return secret;
  }
}
