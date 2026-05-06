export interface AuditEventInput {
  requestId?: string;
  actorType?: "USER" | "API_KEY" | "SYSTEM" | "ANONYMOUS";
  actorUserId?: string;
  clientId?: string;
  actorId?: string;
  actorRole?: string;
  institutionId?: string;
  role?: string;
  endpoint?: string;
  httpMethod?: string;
  action: string;
  targetType: string;
  targetId?: string;
  entityType?: string;
  entityId?: string;
  outcome: "SUCCESS" | "DENIED" | "FAILED";
  reason?: string;
  ipAddressHash?: string;
  userAgentHash?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditWriter {
  write(event: AuditEventInput): Promise<void>;
}
