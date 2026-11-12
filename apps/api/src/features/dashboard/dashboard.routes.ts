import { Router } from "express";
import { z } from "zod";
import type { AuthConfig } from "../../config/auth-config.ts";
import { sendCsv } from "../../lib/csv.ts";
import { isValidUtcDateRange, toUtcDateRange } from "../../lib/utc-date-range.ts";
import { requireAuthentication } from "../auth/auth.middleware.ts";
import type { AuthRepository } from "../auth/auth.types.ts";
import type { DashboardRepository } from "./dashboard.types.ts";

const summaryQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional()
}).strict().refine(
  ({ from, to }) => isValidUtcDateRange(from, to),
  { path: ["to"], message: "The end date must be on or after the start date." }
);

export function createDashboardRouter(
  repository: DashboardRepository,
  authRepository: AuthRepository,
  authConfig: AuthConfig
): Router {
  const router = Router();

  router.get(
    "/summary/export",
    requireAuthentication(authRepository, authConfig),
    async (request, response) => {
      const parsed = summaryQuerySchema.parse(request.query);
      const summary = await repository.getSummary(toUtcDateRange(parsed.from, parsed.to));

      async function* rows(): AsyncGenerator<readonly string[]> {
        yield ["snapshot", "generated_at", "", "", summary.generatedAt.toISOString(), "UTC"];
        yield ["filter", "from", "", "", parsed.from ?? "", "UTC"];
        yield ["filter", "to", "", "", parsed.to ?? "", "UTC"];
        yield [
          "snapshot",
          "containers_total",
          "",
          "",
          String(summary.containerCounts.total),
          "containers"
        ];
        for (const [status, count] of Object.entries(summary.containerCounts.byStatus)) {
          yield ["snapshot", "container_status", "", status, String(count), "containers"];
        }
        yield [
          "snapshot",
          "active_yards",
          "",
          "",
          String(summary.yardCapacity.activeYards),
          "yards"
        ];
        yield [
          "snapshot",
          "yard_capacity",
          "",
          "",
          String(summary.yardCapacity.capacity),
          "slots"
        ];
        yield [
          "snapshot",
          "yard_occupied",
          "",
          "",
          String(summary.yardCapacity.occupied),
          "containers"
        ];
        yield [
          "snapshot",
          "yard_available",
          "",
          "",
          String(summary.yardCapacity.available),
          "slots"
        ];
        yield [
          "snapshot",
          "yard_utilization",
          "",
          "",
          String(summary.yardCapacity.utilizationPercent),
          "percent"
        ];
        for (const yard of summary.yardCapacity.locations) {
          yield ["snapshot", "yard_capacity", "", yard.code, String(yard.capacity), "slots"];
          yield ["snapshot", "yard_occupied", "", yard.code, String(yard.occupied), "containers"];
        }
        for (const direction of ["IN", "OUT"] as const) {
          yield [
            "activity",
            "gate_transactions_total",
            "",
            direction,
            String(summary.gateActivity.byDirection[direction]),
            "transactions"
          ];
        }
        for (const day of summary.gateActivity.byDay) {
          for (const direction of ["IN", "OUT"] as const) {
            yield [
              "activity",
              "gate_transactions_by_day",
              day.date,
              direction,
              String(day.byDirection[direction]),
              "transactions"
            ];
          }
        }
      }

      await sendCsv(
        response,
        "portflow-dashboard-activity.csv",
        ["section", "metric", "date", "dimension", "value", "unit"],
        rows()
      );
    }
  );

  router.get(
    "/summary",
    requireAuthentication(authRepository, authConfig),
    async (request, response) => {
      const parsed = summaryQuerySchema.parse(request.query);
      const summary = await repository.getSummary(toUtcDateRange(parsed.from, parsed.to));

      response.set("Cache-Control", "no-store").status(200).json({ summary });
    }
  );

  return router;
}
