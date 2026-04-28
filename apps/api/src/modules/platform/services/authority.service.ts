import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole, type Prisma } from "@prisma/client";
import type { AuthTokenPayload } from "../../auth/types.js";
import { PrismaService } from "./prisma.service.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AuthorityService {
  constructor(private readonly prisma: PrismaService) {}

  async assertInstitutionCan(institutionRef: string, permission: string, actor?: AuthTokenPayload) {
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

    if (actor) {
      await this.assertActorCanOperateInstitution(actor, institution.uuid);
    }

    const now = new Date();
    const activeGrant = institution.authorityGrants.find(
      (grant) =>
        grant.effectiveFrom <= now &&
        (!grant.expiresAt || grant.expiresAt > now) &&
        permissionAllows(grant.permissions, permission)
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

  async assertActorCanOperateInstitution(actor: AuthTokenPayload, institutionId: string): Promise<void> {
    if (actor.role === UserRole.ACADID_SUPER_ADMIN) {
      return;
    }

    if (actor.kind === "API_KEY") {
      if (actor.institutionUuid === institutionId) {
        return;
      }

      throw new ForbiddenException("API key is not assigned to this institution.");
    }

    const membership = await this.prisma.institutionUser.findFirst({
      where: {
        userId: actor.sub,
        institutionId,
        role: actor.role
      },
      select: { uuid: true }
    });

    if (!membership) {
      throw new ForbiddenException("User is not assigned to this institution.");
    }
  }

  async institutionIdsForActor(actor: AuthTokenPayload): Promise<string[] | undefined> {
    if (actor.role === UserRole.ACADID_SUPER_ADMIN) {
      return undefined;
    }

    if (actor.kind === "API_KEY") {
      return actor.institutionUuid ? [actor.institutionUuid] : [];
    }

    const memberships = await this.prisma.institutionUser.findMany({
      where: {
        userId: actor.sub,
        role: actor.role
      },
      select: { institutionId: true }
    });

    return memberships.map((membership) => membership.institutionId);
  }

  private institutionWhere(institutionRef: string): Prisma.InstitutionWhereInput {
    const refs: Prisma.InstitutionWhereInput[] = [{ institutionId: institutionRef }];
    if (uuidPattern.test(institutionRef)) {
      refs.push({ uuid: institutionRef });
    }

    return { OR: refs };
  }

}

export function permissionAllows(permissions: Prisma.JsonValue, permission: string): boolean {
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
