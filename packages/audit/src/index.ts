export interface AuditEventInput {
  actorId?: string;
  actorRole?: string;
  institutionId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  outcome: "SUCCESS" | "DENIED" | "FAILED";
  reason?: string;
  ipAddressHash?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditWriter {
  write(event: AuditEventInput): Promise<void>;
}
