import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@prisma/client";

export const requiredRolesMetadataKey = "acadid:roles";

export const Roles = (...roles: UserRole[]) => SetMetadata(requiredRolesMetadataKey, roles);
