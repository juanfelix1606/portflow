import type { ContainerStatus, GateDirection } from "../../generated/prisma/client.ts";
import type { UtcDateRange } from "../../lib/utc-date-range.ts";

export interface DashboardYardLocation {
  id: string;
  code: string;
  zone: string;
  occupied: number;
  capacity: number;
}

export interface DashboardMovement {
  id: string;
  containerNumber: string;
  previousStatus: ContainerStatus | null;
  nextStatus: ContainerStatus;
  fromYardCode: string | null;
  toYardCode: string | null;
  description: string | null;
  occurredAt: Date;
  actorName: string;
}

export interface DashboardGateActivityDay {
  date: string;
  byDirection: Record<GateDirection, number>;
}

export interface DashboardSummary {
  generatedAt: Date;
  containerCounts: {
    total: number;
    byStatus: Record<ContainerStatus, number>;
  };
  yardCapacity: {
    activeYards: number;
    capacity: number;
    occupied: number;
    available: number;
    utilizationPercent: number;
    locations: DashboardYardLocation[];
  };
  gateActivity: {
    byDirection: Record<GateDirection, number>;
    byDay: DashboardGateActivityDay[];
  };
  recentMovements: DashboardMovement[];
}

export interface DashboardRepository {
  getSummary(dateRange: UtcDateRange): Promise<DashboardSummary>;
}
