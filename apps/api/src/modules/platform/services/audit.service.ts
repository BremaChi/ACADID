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
        requestId: event.requestId,
        actorType: event.actorType ?? this.inferActorType(event),
        actorUserId: event.actorUserId ?? event.actorId,
        clientId: event.clientId,
        actorId: event.actorId,
        actorRole: event.actorRole as never,
        institutionId: event.institutionId,
        role: event.role ?? event.actorRole,
        endpoint: event.endpoint,
        httpMethod: event.httpMethod,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        entityType: event.entityType ?? event.targetType,
        entityId: event.entityId ?? event.targetId,
        outcome: event.outcome,
        reason: event.reason,
        ipAddressHash: event.ipAddressHash,
        userAgentHash: event.userAgentHash,
        metadata: event.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  private inferActorType(event: AuditEventInput) {
    if (event.clientId) {
      return "API_KEY";
    }
    if (event.actorId) {
      return "USER";
    }
    return "SYSTEM";
  }
}
