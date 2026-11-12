import { Router } from "express";
import { z } from "zod";
import type { AuthConfig } from "../../config/auth-config.ts";
import { requireAuthentication, requireRoles } from "../auth/auth.middleware.ts";
import type { AuthRepository } from "../auth/auth.types.ts";
import type { AuditLogFilters, AuditRepository } from "./audit.types.ts";
import { AuditService } from "./audit.service.ts";
import { sendCsv } from "../../lib/csv.ts";
import { isValidUtcDateRange, toUtcDateRange } from "../../lib/utc-date-range.ts";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  entityType: z.enum(["CONTAINER", "USER", "YARD"]).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional()
}).strict().refine(
  ({ from, to }) => isValidUtcDateRange(from, to),
  { path: ["to"], message: "The end date must be on or after the start date." }
);
const exportQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  entityType: z.enum(["CONTAINER", "USER", "YARD"]).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional()
}).strict().refine(
  ({ from, to }) => isValidUtcDateRange(from, to),
  { path: ["to"], message: "The end date must be on or after the start date." }
);

export function createAuditRouter(
  repository: AuditRepository,
  authRepository: AuthRepository,
  authConfig: AuthConfig
): Router {
  const router = Router();
  const service = new AuditService(repository);

  router.get(
    "/export",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN"),
    async (request, response) => {
      const parsed = exportQuerySchema.parse(request.query);
      const filters = {
        ...(parsed.search !== undefined ? { search: parsed.search } : {}),
        ...(parsed.entityType !== undefined ? { entityType: parsed.entityType } : {}),
        ...(parsed.action !== undefined ? { action: parsed.action } : {}),
        ...toUtcDateRange(parsed.from, parsed.to)
      };

      async function* rows(): AsyncGenerator<readonly string[]> {
        const batchSize = 500;
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const result = await service.list({ ...filters, page, limit: batchSize });
          totalPages = result.pagination.totalPages;
          for (const entry of result.data) {
            yield [
              entry.occurredAt.toISOString(),
              entry.actorName ?? "",
              entry.actorEmail,
              entry.action,
              entry.entityType,
              entry.entityId,
              JSON.stringify(entry.oldValue) ?? "",
              JSON.stringify(entry.newValue) ?? ""
            ];
          }
          page += 1;
        }
      }

      await sendCsv(
        response,
        "portflow-audit-log.csv",
        [
          "occurredAt",
          "actorName",
          "actorEmail",
          "action",
          "entityType",
          "entityId",
          "oldValue",
          "newValue"
        ],
        rows()
      );
    }
  );

  router.get(
    "/",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN"),
    async (request, response) => {
      const parsed = listQuerySchema.parse(request.query);
      const filters: AuditLogFilters = {
        page: parsed.page,
        limit: parsed.limit,
        ...(parsed.search !== undefined ? { search: parsed.search } : {}),
        ...(parsed.entityType !== undefined
          ? { entityType: parsed.entityType }
          : {}),
        ...(parsed.action !== undefined ? { action: parsed.action } : {}),
        ...toUtcDateRange(parsed.from, parsed.to)
      };
      const result = await service.list(filters);

      response.set("Cache-Control", "no-store").status(200).json(result);
    }
  );

  return router;
}
