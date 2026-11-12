import { Prisma } from "../../generated/prisma/client.ts";
import type { ContainerStatus, PrismaClient } from "../../generated/prisma/client.ts";
import { HttpError } from "../../lib/http-error.ts";
import { ContainerImportConflictError } from "./container.types.ts";
import type {
  ContainerActor,
  ContainerCompletionResult,
  ContainerImportRow,
  ContainerListFilters,
  ContainerListResult,
  ContainerMovementListResult,
  ContainerRepository,
  ContainerView,
  MovementListOptions,
  RegisterContainerInput
} from "./container.types.ts";

interface LockedContainer {
  id: string;
  container_number: string;
  status: ContainerStatus;
  current_yard_id: string | null;
}

const containerSelect = {
  id: true,
  containerNumber: true,
  size: true,
  type: true,
  tradeType: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  currentYard: {
    select: {
      id: true,
      code: true
    }
  }
} satisfies Prisma.ContainerSelect;

const movementSelect = {
  id: true,
  previousStatus: true,
  nextStatus: true,
  fromYardId: true,
  fromYardCode: true,
  toYardId: true,
  toYardCode: true,
  description: true,
  occurredAt: true,
  actor: { select: { id: true, name: true } }
} satisfies Prisma.ContainerMovementSelect;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function toContainerView(container: Prisma.ContainerGetPayload<{
  select: typeof containerSelect;
}>): ContainerView {
  return {
    ...container,
    currentYard: container.currentYard
  };
}

function auditValue(container: ContainerView): Prisma.InputJsonObject {
  return {
    containerNumber: container.containerNumber,
    size: container.size,
    type: container.type,
    tradeType: container.tradeType,
    status: container.status
  };
}

export class PrismaContainerRepository implements ContainerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async register(
    input: RegisterContainerInput,
    actor: ContainerActor
  ): Promise<ContainerView> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.container.create({
          data: {
            containerNumber: input.containerNumber,
            size: input.size,
            type: input.type,
            tradeType: input.tradeType
          },
          select: containerSelect
        });
        const container = toContainerView(created);

        await transaction.containerMovement.create({
          data: {
            containerId: container.id,
            actorId: actor.id,
            previousStatus: null,
            nextStatus: "REGISTERED",
            description: "Container registered"
          }
        });

        await transaction.auditLog.create({
          data: {
            actorId: actor.id,
            actorEmail: actor.email,
            action: "CONTAINER_REGISTERED",
            entityType: "CONTAINER",
            entityId: container.id,
            newValue: auditValue(container)
          }
        });

        return container;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(
          409,
          "CONTAINER_ALREADY_EXISTS",
          "A container with this number is already registered."
        );
      }

      throw error;
    }
  }

  async importMany(
    rows: ContainerImportRow[],
    actor: ContainerActor
  ): Promise<ContainerView[]> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.container.findMany({
        where: {
          containerNumber: {
            in: rows.map((row) => row.input.containerNumber)
          }
        },
        select: { containerNumber: true }
      });

      if (existing.length > 0) {
        const existingNumbers = new Set(existing.map((container) => container.containerNumber));
        throw new ContainerImportConflictError(
          rows
            .filter((row) => existingNumbers.has(row.input.containerNumber))
            .map((row) => ({
              row: row.rowNumber,
              column: "containerNumber",
              message: "This container number is already registered."
            }))
        );
      }

      const imported: ContainerView[] = [];

      for (const row of rows) {
        let created: Prisma.ContainerGetPayload<{ select: typeof containerSelect }>;
        try {
          created = await transaction.container.create({
            data: {
              containerNumber: row.input.containerNumber,
              size: row.input.size,
              type: row.input.type,
              tradeType: row.input.tradeType
            },
            select: containerSelect
          });
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            throw new ContainerImportConflictError([{
              row: row.rowNumber,
              column: "containerNumber",
              message: "This container number was registered by another request."
            }]);
          }
          throw error;
        }

        const container = toContainerView(created);
        imported.push(container);
        await transaction.containerMovement.create({
          data: {
            containerId: container.id,
            actorId: actor.id,
            previousStatus: null,
            nextStatus: "REGISTERED",
            description: "Container imported from CSV"
          }
        });
        await transaction.auditLog.create({
          data: {
            actorId: actor.id,
            actorEmail: actor.email,
            action: "CONTAINER_REGISTERED",
            entityType: "CONTAINER",
            entityId: container.id,
            newValue: auditValue(container)
          }
        });
      }

      return imported;
    });
  }

  async findExistingContainerNumbers(numbers: string[]): Promise<string[]> {
    const containers = await this.prisma.container.findMany({
      where: { containerNumber: { in: numbers } },
      select: { containerNumber: true }
    });

    return containers.map((container) => container.containerNumber);
  }

  async list(filters: ContainerListFilters): Promise<ContainerListResult> {
    const where: Prisma.ContainerWhereInput = {
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.size !== undefined ? { size: filters.size } : {}),
      ...(filters.type !== undefined ? { type: filters.type } : {}),
      ...(filters.tradeType !== undefined ? { tradeType: filters.tradeType } : {}),
      ...(filters.yardCode !== undefined
        ? { currentYard: { is: { code: filters.yardCode } } }
        : {}),
      ...(filters.createdAtGte !== undefined || filters.createdAtLt !== undefined
        ? {
            createdAt: {
              ...(filters.createdAtGte !== undefined ? { gte: filters.createdAtGte } : {}),
              ...(filters.createdAtLt !== undefined ? { lt: filters.createdAtLt } : {})
            }
          }
        : {}),
      ...(filters.search
        ? {
            containerNumber: {
              contains: filters.search,
              mode: "insensitive"
            }
          }
        : {})
    };
    const [containers, total] = await Promise.all([
      this.prisma.container.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: containerSelect
      }),
      this.prisma.container.count({ where })
    ]);

    return {
      data: containers.map(toContainerView),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit)
      }
    };
  }

  async findById(id: string): Promise<ContainerView | null> {
    const container = await this.prisma.container.findUnique({
      where: { id },
      select: containerSelect
    });

    return container ? toContainerView(container) : null;
  }

  async complete(
    id: string,
    actor: ContainerActor
  ): Promise<ContainerCompletionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const containers = await transaction.$queryRaw<LockedContainer[]>`
        SELECT "id", "container_number", "status", "current_yard_id"
        FROM "containers"
        WHERE "id" = ${id}
        FOR UPDATE
      `;
      const container = containers[0];

      if (!container) {
        throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
      }

      if (container.status === "COMPLETED") {
        throw new HttpError(
          409,
          "CONTAINER_ALREADY_COMPLETED",
          "This container has already been completed."
        );
      }

      if (container.status !== "GATE_OUT" || container.current_yard_id !== null) {
        throw new HttpError(
          409,
          "INVALID_CONTAINER_STATE",
          "Only a container that has exited the gate can be completed."
        );
      }

      const updated = await transaction.container.updateMany({
        where: {
          id: container.id,
          status: "GATE_OUT",
          currentYardId: null
        },
        data: { status: "COMPLETED" }
      });

      if (updated.count !== 1) {
        throw new HttpError(
          409,
          "INVALID_CONTAINER_STATE",
          "Container status changed before completion could be recorded."
        );
      }

      await transaction.containerMovement.create({
        data: {
          containerId: container.id,
          actorId: actor.id,
          previousStatus: "GATE_OUT",
          nextStatus: "COMPLETED",
          description: "Container lifecycle completed"
        }
      });

      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action: "CONTAINER_COMPLETED",
          entityType: "CONTAINER",
          entityId: container.id,
          oldValue: { status: "GATE_OUT" },
          newValue: { status: "COMPLETED" }
        }
      });

      return {
        id: container.id,
        containerNumber: container.container_number,
        previousStatus: "GATE_OUT",
        status: "COMPLETED"
      };
    });
  }

  async listMovements(
    containerId: string,
    options: MovementListOptions
  ): Promise<ContainerMovementListResult> {
    const where: Prisma.ContainerMovementWhereInput = {
      containerId,
      ...(options.occurredAtGte !== undefined || options.occurredAtLt !== undefined
        ? {
            occurredAt: {
              ...(options.occurredAtGte !== undefined ? { gte: options.occurredAtGte } : {}),
              ...(options.occurredAtLt !== undefined ? { lt: options.occurredAtLt } : {})
            }
          }
        : {})
    };
    const [movements, total] = await Promise.all([
      this.prisma.containerMovement.findMany({
        where,
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: movementSelect
      }),
      this.prisma.containerMovement.count({ where })
    ]);

    return {
      data: movements.map((movement) => ({
        id: movement.id,
        previousStatus: movement.previousStatus,
        nextStatus: movement.nextStatus,
        fromYard:
          movement.fromYardId && movement.fromYardCode
            ? { id: movement.fromYardId, code: movement.fromYardCode }
            : null,
        toYard:
          movement.toYardId && movement.toYardCode
            ? { id: movement.toYardId, code: movement.toYardCode }
            : null,
        description: movement.description,
        occurredAt: movement.occurredAt,
        actor: movement.actor
      })),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit)
      }
    };
  }
}
