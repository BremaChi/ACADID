import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AuthorityService {
  constructor(private readonly prisma: PrismaService) {}

  async assertInstitutionCan(institutionRef: string, permission: string) {
    const institution = await this.prisma.institution.findFirst({
      where: this.institutionWhere(institutionRef),
      include: {
        authorityGrants: {
          where: { status: "ACTIVE" },
          orderBy: { effectiveFrom: "desc" }
        }
      }
    });

    if (!institution) {
      throw new BadRequestException("Institution not found.");
    }

    if (institution.status !== "ACTIVE") {
      throw new BadRequestException("Institution is suspended.");
    }

    const now = new Date();
    const activeGrant = institution.authorityGrants.find(
      (grant) =>
        grant.effectiveFrom <= now &&
        (!grant.expiresAt || grant.expiresAt > now) &&
        this.permissionAllows(grant.permissions, permission)
    );

    if (!activeGrant) {
      throw new BadRequestException(`Institution does not have authority to ${permission}.`);
    }

    return {
      institutionUuid: institution.uuid,
      institutionId: institution.institutionId,
      authorityGrantId: activeGrant.uuid
    };
  }

  private institutionWhere(institutionRef: string): Prisma.InstitutionWhereInput {
    const refs: Prisma.InstitutionWhereInput[] = [{ institutionId: institutionRef }];
    if (uuidPattern.test(institutionRef)) {
      refs.push({ uuid: institutionRef });
    }

    return { OR: refs };
  }

  private permissionAllows(permissions: Prisma.JsonValue, permission: string): boolean {
    if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) {
      return false;
    }

    const record = permissions as Record<string, unknown>;
    if (record.all === true || record[permission] === true) {
      return true;
    }

    const allowed = record.allowed ?? record.permissions;
    return Array.isArray(allowed) && allowed.includes(permission);
  }
}
