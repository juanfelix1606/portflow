import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import type { AuthConfig } from "../../config/auth-config.ts";
import { requireAuthentication, requireRoles } from "../auth/auth.middleware.ts";
import type { AuthRepository } from "../auth/auth.types.ts";
import { HttpError } from "../../lib/http-error.ts";
import { sendCsv } from "../../lib/csv.ts";
import { isValidUtcDateRange, toUtcDateRange } from "../../lib/utc-date-range.ts";
import type { GateActor, GateRepository, GateTransactionFilters } from "./gate.types.ts";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  direction: z.enum(["IN", "OUT"]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional()
}).strict().refine(
  ({ from, to }) => isValidUtcDateRange(from, to),
  { path: ["to"], message: "The end date must be on or after the start date." }
);
const exportQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  direction: z.enum(["IN", "OUT"]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional()
}).strict().refine(
  ({ from, to }) => isValidUtcDateRange(from, to),
  { path: ["to"], message: "The end date must be on or after the start date." }
);
const gateInSchema = z.object({
  containerId: z.string().trim().min(1).max(30),
  vehiclePlate: z.string().trim().toUpperCase().min(2).max(20),
  driverName: z.string().trim().min(1).max(120)
}).strict();

function getActor(request: Request): GateActor {
  const user = request.authUser;

  if (!user) {
    throw new HttpError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  return { id: user.id, email: user.email };
}

export function createGateRouter(
  repository: GateRepository,
  authRepository: AuthRepository,
  authConfig: AuthConfig
): Router {
  const router = Router();

  router.get(
    "/export",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN", "GATE_OPERATOR"),
    async (request, response) => {
      const parsed = exportQuerySchema.parse(request.query);
      const filters = {
        ...(parsed.search !== undefined ? { search: parsed.search } : {}),
        ...(parsed.direction !== undefined ? { direction: parsed.direction } : {}),
        ...toUtcDateRange(parsed.from, parsed.to)
      };

      async function* rows(): AsyncGenerator<readonly string[]> {
        const batchSize = 500;
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const result = await repository.listTransactions({ ...filters, page, limit: batchSize });
          totalPages = result.pagination.totalPages;
          for (const transaction of result.data) {
            yield [
              transaction.occurredAt.toISOString(),
              transaction.direction,
              transaction.container.containerNumber,
              transaction.vehiclePlate,
              transaction.driverName,
              transaction.operator.name
            ];
          }
          page += 1;
        }
      }

      await sendCsv(
        response,
        "portflow-gate-history.csv",
        ["occurredAt", "direction", "containerNumber", "vehiclePlate", "driverName", "operatorName"],
        rows()
      );
    }
  );

  router.get(
    "/",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN", "GATE_OPERATOR"),
    async (request, response) => {
      const parsed = listQuerySchema.parse(request.query);
      const filters: GateTransactionFilters = {
        page: parsed.page,
        limit: parsed.limit,
        ...(parsed.search !== undefined ? { search: parsed.search } : {}),
        ...(parsed.direction !== undefined ? { direction: parsed.direction } : {}),
        ...toUtcDateRange(parsed.from, parsed.to)
      };
      const result = await repository.listTransactions(filters);

      response.set("Cache-Control", "no-store").status(200).json(result);
    }
  );

  router.post(
    "/in",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN", "GATE_OPERATOR"),
    async (request, response) => {
      const input = gateInSchema.parse(request.body);
      const result = await repository.gateIn(input, getActor(request));

      response.status(201).json({ gateTransaction: result });
    }
  );

  router.post(
    "/out",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN", "GATE_OPERATOR"),
    async (request, response) => {
      const input = gateInSchema.parse(request.body);
      const result = await repository.gateOut(input, getActor(request));

      response.status(201).json({ gateTransaction: result });
    }
  );

  return router;
}
