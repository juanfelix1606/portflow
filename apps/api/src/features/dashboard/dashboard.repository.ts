import type { ContainerStatus, GateDirection, PrismaClient } from "../../generated/prisma/client.ts";
import type { UtcDateRange } from "../../lib/utc-date-range.ts";
import type { DashboardRepository, DashboardSummary } from "./dashboard.types.ts";

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(dateRange: UtcDateRange): Promise<DashboardSummary> {
    const now = new Date();
    const utcDayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const utcDayEnd = new Date(utcDayStart.getTime() + 24 * 60 * 60 * 1000);
    const hasDateRange =
      dateRange.occurredAtGte !== undefined || dateRange.occurredAtLt !== undefined;
    const gateOccurredAt = hasDateRange
      ? {
          ...(dateRange.occurredAtGte ? { gte: dateRange.occurredAtGte } : {}),
          ...(dateRange.occurredAtLt ? { lt: dateRange.occurredAtLt } : {})
        }
      : { gte: utcDayStart, lt: utcDayEnd };
    const [containerGroups, yards, gateActivityGroups, movements] = await Promise.all([
      this.prisma.container.groupBy({
        by: ["status"],
        _count: { _all: true }
      }),
      this.prisma.yard.findMany({
        where: { isActive: true },
        orderBy: [{ zone: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          zone: true,
          capacity: true,
          _count: { select: { currentContainers: true } }
        }
      }),
      this.prisma.$queryRaw<Array<{
        activityDate: string;
        direction: GateDirection;
        total: bigint;
      }>>`
        SELECT
          to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "activityDate",
          direction,
          COUNT(*) AS total
        FROM gate_transactions
        WHERE (${gateOccurredAt.gte ?? null}::timestamptz IS NULL
          OR occurred_at >= ${gateOccurredAt.gte ?? null}::timestamptz)
          AND (${gateOccurredAt.lt ?? null}::timestamptz IS NULL
          OR occurred_at < ${gateOccurredAt.lt ?? null}::timestamptz)
        GROUP BY 1, 2
        ORDER BY 1 ASC, 2 ASC
      `,
      this.prisma.containerMovement.findMany({
        where: hasDateRange ? { occurredAt: gateOccurredAt } : {},
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 8,
        select: {
          id: true,
          previousStatus: true,
          nextStatus: true,
          fromYardCode: true,
          toYardCode: true,
          description: true,
          occurredAt: true,
          container: { select: { containerNumber: true } },
          actor: { select: { name: true } }
        }
      })
    ]);

    const byStatus: Record<ContainerStatus, number> = {
      REGISTERED: 0,
      IN_YARD: 0,
      STORED: 0,
      GATE_OUT: 0,
      COMPLETED: 0
    };
    const byDirection: Record<GateDirection, number> = { IN: 0, OUT: 0 };
    const byDay = new Map<string, { date: string; byDirection: Record<GateDirection, number> }>();
    for (const group of containerGroups) {
      byStatus[group.status] = group._count._all;
    }
    for (const group of gateActivityGroups) {
      const count = Number(group.total);
      byDirection[group.direction] += count;
      const day = byDay.get(group.activityDate) ?? {
        date: group.activityDate,
        byDirection: { IN: 0, OUT: 0 }
      };
      day.byDirection[group.direction] += count;
      byDay.set(group.activityDate, day);
    }
    const locations = yards.map((yard) => ({
      id: yard.id,
      code: yard.code,
      zone: yard.zone,
      occupied: yard._count.currentContainers,
      capacity: yard.capacity
    }));
    const capacity = locations.reduce((total, yard) => total + yard.capacity, 0);
    const occupied = locations.reduce((total, yard) => total + yard.occupied, 0);

    return {
      generatedAt: now,
      containerCounts: {
        total: Object.values(byStatus).reduce((total, count) => total + count, 0),
        byStatus
      },
      yardCapacity: {
        activeYards: locations.length,
        capacity,
        occupied,
        available: Math.max(capacity - occupied, 0),
        utilizationPercent: capacity === 0 ? 0 : Math.round((occupied / capacity) * 100),
        locations: locations.sort((left, right) =>
          right.occupied / right.capacity - left.occupied / left.capacity ||
          left.code.localeCompare(right.code)
        )
      },
      gateActivity: {
        byDirection,
        byDay: [...byDay.values()]
      },
      recentMovements: movements.map((movement) => ({
        id: movement.id,
        containerNumber: movement.container.containerNumber,
        previousStatus: movement.previousStatus,
        nextStatus: movement.nextStatus,
        fromYardCode: movement.fromYardCode,
        toYardCode: movement.toYardCode,
        description: movement.description,
        occurredAt: movement.occurredAt,
        actorName: movement.actor.name
      }))
    };
  }
}
