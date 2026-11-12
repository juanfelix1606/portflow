import type {
  AuditLogFilters,
  AuditLogListResult,
  AuditLogRecord,
  AuditRepository
} from "../src/features/audit/audit.types.ts";

export class MemoryAuditRepository implements AuditRepository {
  constructor(readonly logs: AuditLogRecord[] = []) {}

  async listLogs(filters: AuditLogFilters): Promise<AuditLogListResult> {
    const search = filters.search?.toLocaleLowerCase();
    const matching = this.logs
      .filter((log) =>
        (!filters.entityType || log.entityType === filters.entityType) &&
        (!filters.action || log.action === filters.action) &&
        (!filters.occurredAtGte || log.occurredAt >= filters.occurredAtGte) &&
        (!filters.occurredAtLt || log.occurredAt < filters.occurredAtLt) &&
        (!search || [
          log.actorEmail,
          log.actorName ?? "",
          log.action,
          log.entityType,
          log.entityId
        ].some((value) => value.toLocaleLowerCase().includes(search)))
      )
      .sort((left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        left.id.localeCompare(right.id)
      );
    const start = (filters.page - 1) * filters.limit;

    return {
      data: matching.slice(start, start + filters.limit),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: matching.length,
        totalPages: Math.ceil(matching.length / filters.limit)
      }
    };
  }
}

export const emptyAuditRepository = new MemoryAuditRepository();
