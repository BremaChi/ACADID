import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuditEventInput, AuditWriter } from "@acadid/audit";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class AuditService implements AuditWriter {
  constructor(private readonly prisma: PrismaService) {}

  async write(event: AuditEventInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        actorId: event.actorId,
        actorRole: event.actorRole as never,
        institutionId: event.institutionId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        outcome: event.outcome,
        reason: event.reason,
        ipAddressHash: event.ipAddressHash,
        metadata: event.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }
}
