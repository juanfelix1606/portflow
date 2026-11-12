import { Prisma } from "../../generated/prisma/client.ts";
import type { ContainerStatus, PrismaClient } from "../../generated/prisma/client.ts";
import { HttpError } from "../../lib/http-error.ts";
import type {
  GateActor,
  GateInInput,
  GateInResult,
  GateOutResult,
  GateTransactionFilters,
  GateTransactionListResult,
  GateRepository
} from "./gate.types.ts";

const gateTransactionSelect = {
  id: true,
  direction: true,
  vehiclePlate: true,
  driverName: true,
  occurredAt: true,
  container: { select: { id: true, containerNumber: true } },
  operator: { select: { id: true, name: true } }
} satisfies Prisma.GateTransactionSelect;

interface LockedContainer {
  id: string;
  container_number: string;
  status: ContainerStatus;
  current_yard_id: string | null;
  current_yard_code: string | null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export class PrismaGateRepository implements GateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listTransactions(
    filters: GateTransactionFilters
  ): Promise<GateTransactionListResult> {
    const where: Prisma.GateTransactionWhereInput = {
      ...(filters.direction !== undefined ? { direction: filters.direction } : {}),
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
              { vehiclePlate: { contains: filters.search, mode: "insensitive" } },
              { driverName: { contains: filters.search, mode: "insensitive" } },
              {
                container: {
                  is: {
                    containerNumber: { contains: filters.search, mode: "insensitive" }
                  }
                }
              },
              {
                operator: {
                  is: { name: { contains: filters.search, mode: "insensitive" } }
                }
              }
            ]
          }
        : {})
    };
    const [transactions, total] = await Promise.all([
      this.prisma.gateTransaction.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
        select: gateTransactionSelect
      }),
      this.prisma.gateTransaction.count({ where })
    ]);

    return {
      data: transactions,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit)
      }
    };
  }

  async gateIn(input: GateInInput, actor: GateActor): Promise<GateInResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const containers = await transaction.$queryRaw<LockedContainer[]>`
          SELECT c."id", c."container_number", c."status",
            c."current_yard_id", y."code" AS "current_yard_code"
          FROM "containers" c
          LEFT JOIN "yards" y ON y."id" = c."current_yard_id"
          WHERE c."id" = ${input.containerId}
          FOR UPDATE OF c
        `;
        const container = containers[0];

        if (!container) {
          throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
        }

        const existingGateIn = await transaction.gateTransaction.findUnique({
          where: {
            containerId_direction: {
              containerId: container.id,
              direction: "IN"
            }
          },
          select: { id: true }
        });

        if (existingGateIn) {
          throw new HttpError(
            409,
            "DUPLICATE_GATE_IN",
            "This container already has a gate-in transaction."
          );
        }

        if (container.status !== "REGISTERED") {
          throw new HttpError(
            409,
            "INVALID_CONTAINER_STATE",
            `Gate-in requires REGISTERED status; the current status is ${container.status}.`
          );
        }

        const transactionRecord = await transaction.gateTransaction.create({
          data: {
            containerId: container.id,
            operatorId: actor.id,
            direction: "IN",
            vehiclePlate: input.vehiclePlate,
            driverName: input.driverName
          },
          select: {
            id: true,
            direction: true,
            vehiclePlate: true,
            driverName: true,
            occurredAt: true
          }
        });

        const updated = await transaction.container.updateMany({
          where: { id: container.id, status: "REGISTERED" },
          data: { status: "IN_YARD" }
        });

        if (updated.count !== 1) {
          throw new HttpError(
            409,
            "INVALID_CONTAINER_STATE",
            "Container status changed before the gate-in transaction could be completed."
          );
        }

        await transaction.containerMovement.create({
          data: {
            containerId: container.id,
            actorId: actor.id,
            previousStatus: "REGISTERED",
            nextStatus: "IN_YARD",
            description: "Container entered through the gate"
          }
        });

        await transaction.auditLog.create({
          data: {
            actorId: actor.id,
            actorEmail: actor.email,
            action: "GATE_IN_RECORDED",
            entityType: "CONTAINER",
            entityId: container.id,
            oldValue: {
              status: "REGISTERED"
            },
            newValue: {
              status: "IN_YARD",
              direction: "IN",
              vehiclePlate: input.vehiclePlate,
              driverName: input.driverName
            }
          }
        });

        return {
          ...transactionRecord,
          direction: "IN",
          container: {
            id: container.id,
            containerNumber: container.container_number,
            previousStatus: "REGISTERED",
            status: "IN_YARD"
          }
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(
          409,
          "DUPLICATE_GATE_IN",
          "This container already has a gate-in transaction."
        );
      }

      throw error;
    }
  }

  async gateOut(input: GateInInput, actor: GateActor): Promise<GateOutResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const containers = await transaction.$queryRaw<LockedContainer[]>`
          SELECT c."id", c."container_number", c."status",
            c."current_yard_id", y."code" AS "current_yard_code"
          FROM "containers" c
          LEFT JOIN "yards" y ON y."id" = c."current_yard_id"
          WHERE c."id" = ${input.containerId}
          FOR UPDATE OF c
        `;
        const container = containers[0];

        if (!container) {
          throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
        }

        const existingGateOut = await transaction.gateTransaction.findUnique({
          where: {
            containerId_direction: {
              containerId: container.id,
              direction: "OUT"
            }
          },
          select: { id: true }
        });

        if (existingGateOut) {
          throw new HttpError(
            409,
            "DUPLICATE_GATE_OUT",
            "This container already has a gate-out transaction."
          );
        }

        if (container.status !== "STORED") {
          throw new HttpError(
            409,
            "INVALID_CONTAINER_STATE",
            `Gate-out requires STORED status; the current status is ${container.status}.`
          );
        }

        if (!container.current_yard_id || !container.current_yard_code) {
          throw new HttpError(
            409,
            "INVALID_CONTAINER_STATE",
            "Gate-out requires the stored container to have a current yard location."
          );
        }

        const transactionRecord = await transaction.gateTransaction.create({
          data: {
            containerId: container.id,
            operatorId: actor.id,
            direction: "OUT",
            vehiclePlate: input.vehiclePlate,
            driverName: input.driverName
          },
          select: {
            id: true,
            direction: true,
            vehiclePlate: true,
            driverName: true,
            occurredAt: true
          }
        });

        const updated = await transaction.container.updateMany({
          where: {
            id: container.id,
            status: "STORED",
            currentYardId: container.current_yard_id
          },
          data: { status: "GATE_OUT", currentYardId: null }
        });

        if (updated.count !== 1) {
          throw new HttpError(
            409,
            "INVALID_CONTAINER_STATE",
            "Container status or yard location changed before the gate-out transaction could be completed."
          );
        }

        await transaction.containerMovement.create({
          data: {
            containerId: container.id,
            actorId: actor.id,
            previousStatus: "STORED",
            nextStatus: "GATE_OUT",
            fromYardId: container.current_yard_id,
            fromYardCode: container.current_yard_code,
            description: "Container exited through the gate"
          }
        });

        await transaction.auditLog.create({
          data: {
            actorId: actor.id,
            actorEmail: actor.email,
            action: "GATE_OUT_RECORDED",
            entityType: "CONTAINER",
            entityId: container.id,
            oldValue: {
              status: "STORED",
              currentYardId: container.current_yard_id,
              currentYardCode: container.current_yard_code
            },
            newValue: {
              status: "GATE_OUT",
              direction: "OUT",
              vehiclePlate: input.vehiclePlate,
              driverName: input.driverName
            }
          }
        });

        return {
          ...transactionRecord,
          direction: "OUT",
          container: {
            id: container.id,
            containerNumber: container.container_number,
            previousStatus: "STORED",
            status: "GATE_OUT"
          }
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(
          409,
          "DUPLICATE_GATE_OUT",
          "This container already has a gate-out transaction."
        );
      }

      throw error;
    }
  }
}
