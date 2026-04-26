import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { createAuthorityGrantSchema, createInstitutionSchema } from "@acadid/shared";
import { PrismaService } from "../platform/services/prisma.service.js";
import { AuditService } from "../platform/services/audit.service.js";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async createInstitution(input: unknown) {
    const parsed = createInstitutionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const institution = await this.prisma.institution.create({
      data: {
        institutionId: await this.nextInstitutionDisplayId(),
        officialName: parsed.data.officialName,
        type: parsed.data.type,
        state: parsed.data.state,
        tier: parsed.data.tier
      }
    });

    await this.audit.write({
      action: "institution.create",
      targetType: "Institution",
      targetId: institution.uuid,
      institutionId: institution.uuid,
      outcome: "SUCCESS"
    });

    return institution;
  }

  listInstitutions() {
    return this.prisma.institution.findMany({
      orderBy: { createdAt: "desc" }
    });
  }

  async updateInstitutionStatus(id: string, status: "ACTIVE" | "SUSPENDED") {
    const institution = await this.prisma.institution.update({
      where: { uuid: id },
      data: { status }
    });

    await this.audit.write({
      action: "institution.status.update",
      targetType: "Institution",
      targetId: id,
      institutionId: id,
      outcome: "SUCCESS",
      metadata: { status }
    });

    return institution;
  }

  async createAuthorityGrant(institutionId: string, input: unknown) {
    const parsed = createAuthorityGrantSchema.safeParse({
      ...(typeof input === "object" && input ? input : {}),
      institutionId
    });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const grant = await this.prisma.authorityGrant.create({
      data: {
        institutionId,
        mouDocumentUrl: "pending-secure-storage-url",
        signedByName: parsed.data.signedByName,
        signedByTitle: parsed.data.signedByTitle,
        effectiveFrom: new Date(parsed.data.effectiveFrom),
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        permissions: parsed.data.permissions as Prisma.InputJsonValue
      }
    });

    await this.audit.write({
      action: "authority_grant.create",
      targetType: "AuthorityGrant",
      targetId: grant.uuid,
      institutionId,
      outcome: "SUCCESS"
    });

    return grant;
  }

  private async nextInstitutionDisplayId(): Promise<string> {
    const count = await this.prisma.institution.count();
    return `AINi-${(count + 1).toString().padStart(5, "0")}`;
  }
}
