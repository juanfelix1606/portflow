import type { Prisma } from "../../generated/prisma/client.ts";

export type AuditEntityType = "CONTAINER" | "USER" | "YARD";

export interface AuditLogFilters {
  page: number;
  limit: number;
  search?: string;
  entityType?: AuditEntityType;
  action?: string;
  occurredAtGte?: Date;
  occurredAtLt?: Date;
}

export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  actorEmail: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Prisma.JsonValue | null;
  newValue: Prisma.JsonValue | null;
  occurredAt: Date;
}

export interface AuditLogListResult {
  data: AuditLogRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuditRepository {
  listLogs(filters: AuditLogFilters): Promise<AuditLogListResult>;
}
