import { Module } from "@nestjs/common";
import { AuditService } from "./services/audit.service.js";
import { CredentialSigningService } from "./services/credential-signing.service.js";
import { PrismaService } from "./services/prisma.service.js";

@Module({
  providers: [PrismaService, AuditService, CredentialSigningService],
  exports: [PrismaService, AuditService, CredentialSigningService]
})
export class PlatformServicesModule {}
