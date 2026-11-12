import type { DashboardRepository, DashboardSummary } from "../src/features/dashboard/dashboard.types.ts";

export const emptyDashboardRepository: DashboardRepository = {
  async getSummary(): Promise<DashboardSummary> {
    return {
      generatedAt: new Date(),
      containerCounts: {
        total: 0,
        byStatus: {
          REGISTERED: 0,
          IN_YARD: 0,
          STORED: 0,
          GATE_OUT: 0,
          COMPLETED: 0
        }
      },
      yardCapacity: {
        activeYards: 0,
        capacity: 0,
        occupied: 0,
        available: 0,
        utilizationPercent: 0,
        locations: []
      },
      gateActivity: {
        byDirection: { IN: 0, OUT: 0 },
        byDay: []
      },
      recentMovements: []
    };
  }
};
