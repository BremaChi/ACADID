import { Controller, Get, Param } from "@nestjs/common";
import { VerificationService } from "./verification.service.js";

@Controller("verify")
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get(":token")
  verifyToken(@Param("token") token: string) {
    return this.verificationService.verifyToken(token);
  }

  @Get("ref/:refnum")
  verifyReference(@Param("refnum") refnum: string) {
    return this.verificationService.verifyReference(refnum);
  }

  @Get("status/:credId")
  credentialStatus(@Param("credId") credId: string) {
    return this.verificationService.credentialStatus(credId);
  }
}
