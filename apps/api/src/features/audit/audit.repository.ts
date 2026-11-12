import { Prisma } from "../../generated/prisma/client.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import type {
  AuditLogFilters,
  AuditLogListResult,
  AuditRepository
} from "./audit.types.ts";

const auditLogSelect = {
  id: true,
  actorId: true,
  actorEmail: true,
  actor: { select: { name: true } },
  action: true,
  entityType: true,
  entityId: true,
  oldValue: true,
  newValue: true,
  occurredAt: true
} satisfies Prisma.AuditLogSelect;

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listLogs(filters: AuditLogFilters): Promise<AuditLogListResult> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.entityType !== undefined ? { entityType: filters.entityType } : {}),
      ...(filters.action !== undefined ? { action: filters.action } : {}),
      ...(filters.occurredAtGte !== undefined || filters.occurredAtLt !== undefined
        ? {
            occurredAt: {
              ...(filters.occurredAtGte !== undefined ? { gte: filters.occurredAtGte } : {}),
              ...(filters.occurredAtLt !== undefined ? { lt: filters.occurredAtLt } : {})
            }
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { actorEmail: { contains: filters.search, mode: "insensitive" } },
              { action: { contains: filters.search, mode: "insensitive" } },
              { entityType: { contains: filters.search, mode: "insensitive" } },
              { entityId: { contains: filters.search, mode: "insensitive" } },
              {
                actor: {
                  is: { name: { contains: filters.search, mode: "insensitive" } }
                }
              }
            ]
          }
        : {})
    };
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
        select: auditLogSelect
      }),
      this.prisma.auditLog.count({ where })
    ]);

    return {
      data: logs.map((log) => ({
        id: log.id,
        actorId: log.actorId,
        actorEmail: log.actorEmail,
        actorName: log.actor?.name ?? null,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        oldValue: log.oldValue,
        newValue: log.newValue,
        occurredAt: log.occurredAt
      })),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit)
      }
    };
  }
}
