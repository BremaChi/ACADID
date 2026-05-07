import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole, type Prisma } from "@prisma/client";
import type { AuthTokenPayload } from "../../auth/types.js";
import { PrismaService } from "./prisma.service.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AcademicStructureScopeNode = {
  uuid: string;
  institutionId: string;
  parentId: string | null;
  type: string;
  name: string;
  code: string | null;
};

export interface WorkspaceScope {
  mode: "PLATFORM" | "INSTITUTION";
  institutionIds?: string[];
  primaryInstitutionId?: string;
}

export type AcademicScopeTarget = Record<string, string | undefined>;

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
        ...(actor.institutionUserId ? { uuid: actor.institutionUserId } : {}),
        userId: actor.sub,
        institutionId,
        role: actor.role,
        status: "ACTIVE",
        institution: { status: "ACTIVE" }
      },
      select: { uuid: true }
    });

    if (!membership) {
      throw new ForbiddenException("User is not assigned to this institution.");
    }
  }

  async workspaceScopeForActor(actor: AuthTokenPayload): Promise<WorkspaceScope> {
    if (actor.role === UserRole.ACADID_SUPER_ADMIN) {
      return { mode: "PLATFORM" };
    }

    const institutionIds = (await this.institutionIdsForActor(actor)) ?? [];
    return {
      mode: "INSTITUTION",
      institutionIds,
      primaryInstitutionId: institutionIds[0]
    };
  }

  async institutionWhereForActor(
    actor: AuthTokenPayload,
    institutionField: string = "institutionId"
  ): Promise<Record<string, unknown> | undefined> {
    const institutionIds = await this.institutionIdsForActor(actor);
    if (!institutionIds) {
      return undefined;
    }

    return { [institutionField]: { in: institutionIds } };
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
        role: actor.role,
        status: "ACTIVE",
        institution: { status: "ACTIVE" }
      },
      select: { institutionId: true }
    });

    return memberships.map((membership) => membership.institutionId);
  }

  async assertActorAssignedScope(
    actor: AuthTokenPayload,
    input: { institutionId: string; structureScopeId?: string; target?: AcademicScopeTarget }
  ): Promise<void> {
    await this.assertActorCanOperateInstitution(actor, input.institutionId);

    if (actor.role === UserRole.ACADID_SUPER_ADMIN || actor.role === UserRole.REGISTRAR || actor.kind === "API_KEY") {
      return;
    }

    const assignedScopes = await this.assignedScopesForActor(actor, input.institutionId);
    if (assignedScopes.length === 0) {
      throw new ForbiddenException("User is not assigned to this academic scope.");
    }

    const target = {
      ...(input.target ?? {}),
      ...(input.structureScopeId ? await this.academicStructureScopeTarget(input.institutionId, input.structureScopeId) : {})
    };

    if (Object.keys(target).length === 0) {
      return;
    }

    const allowed = assignedScopes.some((scope) => scopeMatchesTarget(scope, target));
    if (!allowed) {
      throw new ForbiddenException("User is not assigned to this academic scope.");
    }
  }

  private institutionWhere(institutionRef: string): Prisma.InstitutionWhereInput {
    const refs: Prisma.InstitutionWhereInput[] = [{ institutionId: institutionRef }];
    if (uuidPattern.test(institutionRef)) {
      refs.push({ uuid: institutionRef });
    }

    return { OR: refs };
  }

  private async assignedScopesForActor(actor: AuthTokenPayload, institutionId: string) {
    const tokenScopes = normaliseAssignedScopes(actor.assignedScopes);
    if (tokenScopes.length > 0) {
      return tokenScopes;
    }

    if (!actor.institutionUserId) {
      return [];
    }

    const membership = await this.prisma.institutionUser.findFirst({
      where: {
        uuid: actor.institutionUserId,
        userId: actor.sub,
        institutionId,
        role: actor.role,
        status: "ACTIVE",
        institution: { status: "ACTIVE" }
      },
      select: { assignedScopes: true }
    });

    return normaliseAssignedScopes(membership?.assignedScopes);
  }

  private async academicStructureScopeTarget(institutionId: string, structureScopeId: string): Promise<AcademicScopeTarget> {
    const target: AcademicScopeTarget = {
      structure_scope_id: structureScopeId,
      structureScopeId
    };
    let currentId: string | null = structureScopeId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node: AcademicStructureScopeNode | null = await this.prisma.academicStructure.findUnique({
        where: { uuid: currentId },
        select: {
          uuid: true,
          institutionId: true,
          parentId: true,
          type: true,
          name: true,
          code: true
        }
      });

      if (!node || node.institutionId !== institutionId) {
        throw new ForbiddenException("Academic scope is outside this institution.");
      }

      const typeKey = node.type.toLowerCase();
      target[typeKey] = node.name;
      target[`${typeKey}_id`] = node.uuid;
      if (node.code) {
        target[`${typeKey}_code`] = node.code;
      }
      if (node.type === "COURSE" && node.code) {
        target.course_code = node.code;
      }
      if (node.type === "SUBJECT") {
        target.subject = node.name;
        if (node.code) {
          target.subject_code = node.code;
        }
      }
      if (node.type === "ARM") {
        target.class_arm = node.name;
      }

      currentId = node.parentId;
    }

    return target;
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

export function scopeMatchesTarget(scope: Record<string, unknown>, target: AcademicScopeTarget): boolean {
  const entries = Object.entries(scope).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([key, value]) => {
    const expected = target[normaliseScopeKey(key)];
    return expected !== undefined && normaliseScopeValue(expected) === normaliseScopeValue(value);
  });
}

function normaliseAssignedScopes(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((scope): scope is Record<string, unknown> => Boolean(scope) && typeof scope === "object" && !Array.isArray(scope))
    : [];
}

function normaliseScopeKey(key: string) {
  return key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`).toLowerCase();
}

function normaliseScopeValue(value: unknown) {
  return String(value).trim().toLowerCase();
}
