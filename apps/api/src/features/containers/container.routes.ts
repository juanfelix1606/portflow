import express, { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import type { AuthConfig } from "../../config/auth-config.ts";
import { requireAuthentication, requireRoles } from "../auth/auth.middleware.ts";
import type { AuthRepository } from "../auth/auth.types.ts";
import { HttpError } from "../../lib/http-error.ts";
import { CsvParseError, parseCsv, sendCsv } from "../../lib/csv.ts";
import { isValidUtcDateRange, toUtcDateRange } from "../../lib/utc-date-range.ts";
import { isValidIso6346ContainerNumber } from "./iso6346.ts";
import { ContainerImportConflictError } from "./container.types.ts";
import type {
  ContainerImportIssue,
  ContainerImportRow,
  ContainerListFilters,
  ContainerRepository,
  ContainerActor
} from "./container.types.ts";
import { ContainerService } from "./container.service.ts";

const containerSizes = ["TWENTY_FT", "FORTY_FT", "FORTY_FIVE_FT"] as const;
const containerTypes = ["DRY", "REEFER", "OPEN_TOP", "FLAT_RACK", "TANK"] as const;
const tradeTypes = ["IMPORT", "EXPORT"] as const;
const containerStatuses = [
  "REGISTERED",
  "IN_YARD",
  "STORED",
  "GATE_OUT",
  "COMPLETED"
] as const;

const containerFilterShape = {
  search: z.string().trim().min(1).max(11).transform((value) => value.toUpperCase()).optional(),
  status: z.enum(containerStatuses).optional(),
  size: z.enum(containerSizes).optional(),
  type: z.enum(containerTypes).optional(),
  tradeType: z.enum(tradeTypes).optional(),
  yardCode: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional()
};
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  ...containerFilterShape
}).strict().refine(
  ({ from, to }) => isValidUtcDateRange(from, to),
  { path: ["to"], message: "The end date must be on or after the start date." }
);
const exportQuerySchema = z.object(containerFilterShape).strict().refine(
  ({ from, to }) => isValidUtcDateRange(from, to),
  { path: ["to"], message: "The end date must be on or after the start date." }
);

const registerContainerSchema = z.object({
  containerNumber: z.string()
    .trim()
    .toUpperCase()
    .refine(isValidIso6346ContainerNumber, {
      message: "Container number must follow ISO 6346 and have a valid check digit."
    }),
  size: z.enum(containerSizes),
  type: z.enum(containerTypes),
  tradeType: z.enum(tradeTypes)
}).strict();
const importHeader = ["containerNumber", "size", "type", "tradeType"];

const movementDateFilterShape = {
  from: z.iso.date().optional(),
  to: z.iso.date().optional()
};
const movementQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  ...movementDateFilterShape
}).strict().refine(
  ({ from, to }) => isValidUtcDateRange(from, to),
  { path: ["to"], message: "The end date must be on or after the start date." }
);
const movementExportQuerySchema = z.object(movementDateFilterShape).strict().refine(
  ({ from, to }) => isValidUtcDateRange(from, to),
  { path: ["to"], message: "The end date must be on or after the start date." }
);

function getActor(request: Request): ContainerActor {
  const user = request.authUser;

  if (!user) {
    throw new HttpError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  return { id: user.id, email: user.email };
}

function getCreatedAtFilters(from?: string, to?: string) {
  const dateRange = toUtcDateRange(from, to);
  return {
    ...(dateRange.occurredAtGte !== undefined
      ? { createdAtGte: dateRange.occurredAtGte }
      : {}),
    ...(dateRange.occurredAtLt !== undefined
      ? { createdAtLt: dateRange.occurredAtLt }
      : {})
  };
}

class ContainerCsvImportError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly issues: ContainerImportIssue[] = []
  ) {
    super(message);
    this.name = "ContainerCsvImportError";
  }
}

function parseContainerCsv(contents: string): ContainerImportRow[] {
  let records: string[][];
  try {
    records = parseCsv(contents);
  } catch (error) {
    if (!(error instanceof CsvParseError)) {
      throw error;
    }
    throw new ContainerCsvImportError(400, "INVALID_CSV", error.message);
  }

  const header = records.shift();
  if (header?.[0]?.startsWith("\uFEFF")) {
    header[0] = header[0].slice(1);
  }
  if (!header || header.length !== importHeader.length ||
    !header.every((value, index) => value === importHeader[index])) {
    throw new ContainerCsvImportError(
      400,
      "INVALID_CSV_HEADER",
      "The CSV header does not match the required format.",
      [{
        row: 1,
        column: "header",
        message: `CSV header must be ${importHeader.join(",")}.`
      }]
    );
  }

  if (records.length === 0) {
    throw new ContainerCsvImportError(
      400,
      "EMPTY_CSV",
      "The CSV file must contain at least one container row."
    );
  }
  if (records.length > 500) {
    throw new ContainerCsvImportError(
      400,
      "CSV_ROW_LIMIT_EXCEEDED",
      "The CSV file contains more than 500 data rows.",
      [{
        row: 502,
        column: "",
        message: "A CSV import may contain at most 500 data rows."
      }]
    );
  }

  const issues: ContainerImportIssue[] = [];
  const rows: ContainerImportRow[] = [];
  const firstRowByNumber = new Map<string, number>();

  records.forEach((columns, index) => {
    const rowNumber = index + 2;
    if (columns.length !== importHeader.length) {
      issues.push({
        row: rowNumber,
        column: "",
        message: `Expected ${importHeader.length} columns, received ${columns.length}.`
      });
      return;
    }

    const parsed = registerContainerSchema.safeParse({
      containerNumber: columns[0],
      size: columns[1],
      type: columns[2],
      tradeType: columns[3]
    });
    if (!parsed.success) {
      issues.push(...parsed.error.issues.map((issue) => ({
        row: rowNumber,
        column: String(issue.path[0] ?? ""),
        message: issue.message
      })));
      return;
    }

    const duplicateRow = firstRowByNumber.get(parsed.data.containerNumber);
    if (duplicateRow !== undefined) {
      issues.push({
        row: rowNumber,
        column: "containerNumber",
        message: `Container number duplicates row ${duplicateRow}.`
      });
      return;
    }
    firstRowByNumber.set(parsed.data.containerNumber, rowNumber);
    rows.push({ rowNumber, input: parsed.data });
  });

  if (issues.length > 0) {
    throw new ContainerCsvImportError(
      400,
      "CONTAINER_IMPORT_VALIDATION_FAILED",
      "No containers were imported because the CSV contains invalid rows.",
      issues
    );
  }

  return rows;
}

function respondWithImportError(
  response: Response,
  error: ContainerCsvImportError
) {
  return response.status(error.statusCode).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.issues.length > 0 ? { details: error.issues } : {})
    }
  });
}

export function createContainerRouter(
  repository: ContainerRepository,
  authRepository: AuthRepository,
  authConfig: AuthConfig
): Router {
  const router = Router();
  const service = new ContainerService(repository);

  router.post(
    "/import/preview",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN"),
    express.text({ type: "text/csv", limit: "1mb" }),
    async (request, response) => {
      let rows: ContainerImportRow[];
      try {
        if (typeof request.body !== "string") {
          throw new ContainerCsvImportError(
            400,
            "INVALID_CSV",
            "Request body must be a CSV file with Content-Type text/csv."
          );
        }
        rows = parseContainerCsv(request.body);
      } catch (error) {
        if (error instanceof ContainerCsvImportError) {
          return respondWithImportError(response, error);
        }
        throw error;
      }

      const conflicts = await service.findImportConflicts(rows);
      if (conflicts.length > 0) {
        return response.status(409).json({
          error: {
            code: "CONTAINER_IMPORT_CONFLICT",
            message: "The preview found container numbers that are already registered.",
            details: conflicts
          }
        });
      }

      response.status(200).json({
        rowCount: rows.length,
        sample: rows.slice(0, 10).map(({ rowNumber, input }) => ({
          row: rowNumber,
          ...input
        }))
      });
    }
  );

  router.post(
    "/import",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN"),
    express.text({ type: "text/csv", limit: "1mb" }),
    async (request, response) => {
      let rows: ContainerImportRow[];
      try {
        if (typeof request.body !== "string") {
          throw new ContainerCsvImportError(
            400,
            "INVALID_CSV",
            "Request body must be a CSV file with Content-Type text/csv."
          );
        }
        rows = parseContainerCsv(request.body);
      } catch (error) {
        if (error instanceof ContainerCsvImportError) {
          return respondWithImportError(response, error);
        }
        throw error;
      }

      try {
        const imported = await service.importMany(rows, getActor(request));
        response.status(201).json({
          importedCount: imported.length,
          containers: imported.map(({ id, containerNumber }) => ({ id, containerNumber }))
        });
      } catch (error) {
        if (!(error instanceof ContainerImportConflictError)) {
          throw error;
        }
        response.status(409).json({
          error: {
            code: "CONTAINER_IMPORT_CONFLICT",
            message: "No containers were imported because one or more numbers are already registered.",
            details: error.issues
          }
        });
      }
    }
  );

  router.get(
    "/export",
    requireAuthentication(authRepository, authConfig),
    async (request, response) => {
      const parsed = exportQuerySchema.parse(request.query);
      const filters = {
        ...(parsed.search !== undefined ? { search: parsed.search } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
        ...(parsed.size !== undefined ? { size: parsed.size } : {}),
        ...(parsed.type !== undefined ? { type: parsed.type } : {}),
        ...(parsed.tradeType !== undefined ? { tradeType: parsed.tradeType } : {}),
        ...(parsed.yardCode !== undefined ? { yardCode: parsed.yardCode } : {}),
        ...getCreatedAtFilters(parsed.from, parsed.to)
      };

      async function* rows(): AsyncGenerator<readonly string[]> {
        const batchSize = 500;
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const result = await service.list({ ...filters, page, limit: batchSize });
          totalPages = result.pagination.totalPages;
          for (const container of result.data) {
            yield [
              container.id,
              container.containerNumber,
              container.size,
              container.type,
              container.tradeType,
              container.status,
              container.currentYard?.code ?? "",
              container.createdAt.toISOString(),
              container.updatedAt.toISOString()
            ];
          }
          page += 1;
        }
      }

      await sendCsv(
        response,
        "portflow-container-inventory.csv",
        [
          "id",
          "containerNumber",
          "size",
          "type",
          "tradeType",
          "status",
          "currentYardCode",
          "createdAt",
          "updatedAt"
        ],
        rows()
      );
    }
  );

  router.get(
    "/",
    requireAuthentication(authRepository, authConfig),
    async (request, response) => {
      const parsed = listQuerySchema.parse(request.query);
      const filters: ContainerListFilters = {
        page: parsed.page,
        limit: parsed.limit,
        ...(parsed.search !== undefined ? { search: parsed.search } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
        ...(parsed.size !== undefined ? { size: parsed.size } : {}),
        ...(parsed.type !== undefined ? { type: parsed.type } : {}),
        ...(parsed.tradeType !== undefined ? { tradeType: parsed.tradeType } : {}),
        ...(parsed.yardCode !== undefined ? { yardCode: parsed.yardCode } : {}),
        ...getCreatedAtFilters(parsed.from, parsed.to)
      };
      const result = await service.list(filters);

      response.set("Cache-Control", "no-store").status(200).json(result);
    }
  );

  router.post(
    "/",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN"),
    async (request, response) => {
      const input = registerContainerSchema.parse(request.body);
      const container = await service.register(input, getActor(request));

      response.status(201).json({ container });
    }
  );

  router.post(
    "/:containerId/complete",
    requireAuthentication(authRepository, authConfig),
    requireRoles("ADMIN", "GATE_OPERATOR"),
    async (request, response) => {
      const containerId = z.string().min(1).max(30).parse(request.params.containerId);
      const result = await service.complete(containerId, getActor(request));

      response.status(201).json({ completion: result });
    }
  );

  router.get(
    "/:containerId/movements/export",
    requireAuthentication(authRepository, authConfig),
    async (request, response) => {
      const containerId = z.string().min(1).max(30).parse(request.params.containerId);
      const parsed = movementExportQuerySchema.parse(request.query);
      const container = await service.findById(containerId);
      const dateRange = toUtcDateRange(parsed.from, parsed.to);

      async function* rows(): AsyncGenerator<readonly string[]> {
        const batchSize = 500;
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const result = await repository.listMovements(containerId, {
            page,
            limit: batchSize,
            ...dateRange
          });
          totalPages = result.pagination.totalPages;
          for (const movement of result.data) {
            yield [
              movement.occurredAt.toISOString(),
              container.containerNumber,
              movement.previousStatus ?? "",
              movement.nextStatus,
              movement.fromYard?.code ?? "",
              movement.toYard?.code ?? "",
              movement.description ?? "",
              movement.actor.name
            ];
          }
          page += 1;
        }
      }

      await sendCsv(
        response,
        "portflow-container-movements.csv",
        [
          "occurredAt",
          "containerNumber",
          "previousStatus",
          "nextStatus",
          "fromYardCode",
          "toYardCode",
          "description",
          "actorName"
        ],
        rows()
      );
    }
  );

  router.get(
    "/:containerId/movements",
    requireAuthentication(authRepository, authConfig),
    async (request, response) => {
      const containerId = z.string().min(1).max(30).parse(request.params.containerId);
      const parsed = movementQuerySchema.parse(request.query);
      const result = await service.listMovements(containerId, {
        page: parsed.page,
        limit: parsed.limit,
        ...toUtcDateRange(parsed.from, parsed.to)
      });

      response.set("Cache-Control", "no-store").status(200).json(result);
    }
  );

  router.get(
    "/:containerId",
    requireAuthentication(authRepository, authConfig),
    async (request, response) => {
      const containerId = z.string().min(1).max(30).parse(request.params.containerId);
      const container = await service.findById(containerId);

      response.set("Cache-Control", "no-store").status(200).json({ container });
    }
  );

  return router;
}
