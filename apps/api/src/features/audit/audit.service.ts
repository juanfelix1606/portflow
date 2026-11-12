import { Prisma } from "../../generated/prisma/client.ts";
import type { AuditLogFilters, AuditLogListResult, AuditRepository } from "./audit.types.ts";

const sensitiveAuditKeys = new Set([
  "password",
  "passwordhash",
  "token",
  "tokenhash",
  "accesstoken",
  "refreshtoken",
  "credential",
  "credentials",
  "secret",
  "secretkey"
]);

function sanitizeAuditValue(value: Prisma.JsonValue | null): Prisma.JsonValue | null {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeAuditValue);
  }

  const sanitized: Prisma.JsonObject = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (nestedValue !== undefined && !sensitiveAuditKeys.has(normalizedKey)) {
      sanitized[key] = sanitizeAuditValue(nestedValue);
    }
  }
  return sanitized;
}

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async list(filters: AuditLogFilters): Promise<AuditLogListResult> {
    const result = await this.repository.listLogs(filters);

    return {
      ...result,
      data: result.data.map((log) => ({
        ...log,
        oldValue: sanitizeAuditValue(log.oldValue),
        newValue: sanitizeAuditValue(log.newValue)
      }))
    };
  }
}
