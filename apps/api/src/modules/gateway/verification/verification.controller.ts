import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { RateLimit } from "../../platform/decorators/rate-limit.decorator.js";
import { RateLimitGuard } from "../../platform/guards/rate-limit.guard.js";
import { VerificationService } from "./verification.service.js";

type VerificationRequest = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket: {
    remoteAddress?: string;
  };
};

@UseGuards(RateLimitGuard)
@RateLimit({ scope: "verify.public", key: "ip", limit: 120, windowSeconds: 60 })
@Controller("verify")
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get("ref/:refnum")
  verifyReference(@Param("refnum") refnum: string, @Req() request: VerificationRequest) {
    return this.verificationService.verifyReference(refnum, this.verificationContext(request));
  }

  @RateLimit({ scope: "verify.bulk", key: "ip", limit: 20, windowSeconds: 60 })
  @Post("bulk")
  bulkVerify(@Body() body: unknown, @Req() request: VerificationRequest) {
    return this.verificationService.bulkVerify(body, this.verificationContext(request));
  }

  @RateLimit({ scope: "verify.ain", key: "ip", limit: 60, windowSeconds: 60 })
  @Get("ain/:ain")
  lookupAin(@Param("ain") ain: string, @Req() request: VerificationRequest) {
    return this.verificationService.lookupAin(ain, this.verificationContext(request));
  }

  @Get("status/:credId")
  credentialStatus(@Param("credId") credId: string, @Req() request: VerificationRequest) {
    return this.verificationService.credentialStatus(credId, this.verificationContext(request));
  }

  @Get(":token")
  verifyToken(@Param("token") token: string, @Req() request: VerificationRequest) {
    return this.verificationService.verifyToken(token, this.verificationContext(request));
  }

  private verificationContext(request: VerificationRequest) {
    const header = (name: string) => {
      const value = request.headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };
    const forwardedFor = header("x-forwarded-for")?.split(",")[0]?.trim();

    return {
      ipAddress: forwardedFor || header("x-real-ip") || request.ip || request.socket.remoteAddress || null,
      verifierName: this.truncate(header("x-acadid-verifier-name"), 120),
      verifierEmail: this.truncate(header("x-acadid-verifier-email"), 254)
    };
  }

  private truncate(value: string | undefined, maxLength: number): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, maxLength) : undefined;
  }
}
