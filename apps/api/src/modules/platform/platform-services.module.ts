import { Module } from "@nestjs/common";
import { AuditService } from "./services/audit.service.js";
import { AuthorityService } from "./services/authority.service.js";
import { CredentialSigningService } from "./services/credential-signing.service.js";
import { PrismaService } from "./services/prisma.service.js";

@Module({
  providers: [PrismaService, AuditService, AuthorityService, CredentialSigningService],
  exports: [PrismaService, AuditService, AuthorityService, CredentialSigningService]
})
export class PlatformServicesModule {}
