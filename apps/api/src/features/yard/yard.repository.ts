import type { ContainerStatus, PrismaClient } from "../../generated/prisma/client.ts";
import { HttpError } from "../../lib/http-error.ts";
import type {
  PlaceContainerInput,
  RelocateContainerInput,
  ManagedYard,
  YardActor,
  YardPlacementResult,
  UpdateYardInput,
  YardRepository
} from "./yard.types.ts";

interface LockedContainer {
  id: string;
  container_number: string;
  status: ContainerStatus;
  current_yard_id: string | null;
}

interface LockedYard {
  id: string;
  code: string;
  zone?: string;
  capacity: number;
  is_active: boolean;
}

export class PrismaYardRepository implements YardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listYards(): Promise<ManagedYard[]> {
    const yards = await this.prisma.yard.findMany({
      include: { _count: { select: { currentContainers: true } } },
      orderBy: [{ zone: "asc" }, { code: "asc" }]
    });

    return yards.map((yard) => ({
      id: yard.id,
      code: yard.code,
      zone: yard.zone,
      capacity: yard.capacity,
      occupied: yard._count.currentContainers,
      isActive: yard.isActive
    }));
  }

  async updateYard(
    yardId: string,
    input: UpdateYardInput,
    actor: YardActor
  ): Promise<ManagedYard> {
    return this.prisma.$transaction(async (transaction) => {
      const yards = await transaction.$queryRaw<LockedYard[]>`
        SELECT "id", "code", "zone", "capacity", "is_active"
        FROM "yards"
        WHERE "id" = ${yardId}
        FOR UPDATE
      `;
      const current = yards[0];

      if (!current) {
        throw new HttpError(404, "YARD_NOT_FOUND", "The requested yard location was not found.");
      }

      const occupied = await transaction.container.count({
        where: { currentYardId: current.id }
      });
      const capacity = input.capacity ?? current.capacity;
      const isActive = input.isActive ?? current.is_active;

      if (capacity < occupied) {
        throw new HttpError(
          409,
          "YARD_CAPACITY_BELOW_OCCUPANCY",
          "Yard capacity cannot be lower than its current occupancy."
        );
      }

      if (!isActive && occupied > 0) {
        throw new HttpError(
          409,
          "YARD_HAS_CONTAINERS",
          "A yard location cannot be deactivated while containers remain assigned to it."
        );
      }

      const unchanged = capacity === current.capacity && isActive === current.is_active;
      if (unchanged) {
        return {
          id: current.id,
          code: current.code,
          zone: current.zone ?? current.code.split("-")[0] ?? "",
          capacity,
          occupied,
          isActive
        };
      }

      const updated = await transaction.yard.update({
        where: { id: current.id },
        data: { capacity, isActive }
      });

      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action: "YARD_UPDATED",
          entityType: "YARD",
          entityId: updated.id,
          oldValue: {
            capacity: current.capacity,
            isActive: current.is_active
          },
          newValue: { capacity, isActive }
        }
      });

      return {
        id: updated.id,
        code: updated.code,
        zone: updated.zone,
        capacity: updated.capacity,
        occupied,
        isActive: updated.isActive
      };
    });
  }

  async place(
    input: PlaceContainerInput,
    actor: YardActor
  ): Promise<YardPlacementResult> {
    return this.prisma.$transaction(async (transaction) => {
      const containers = await transaction.$queryRaw<LockedContainer[]>`
        SELECT "id", "container_number", "status", "current_yard_id"
        FROM "containers"
        WHERE "id" = ${input.containerId}
        FOR UPDATE
      `;
      const container = containers[0];

      if (!container) {
        throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
      }

      if (container.status !== "IN_YARD" || container.current_yard_id !== null) {
        throw new HttpError(
          409,
          "INVALID_CONTAINER_STATE",
          `Yard placement requires an unplaced IN_YARD container; the current status is ${container.status}.`
        );
      }

      const yards = await transaction.$queryRaw<LockedYard[]>`
        SELECT "id", "code", "capacity", "is_active"
        FROM "yards"
        WHERE "code" = ${input.yardCode}
        FOR UPDATE
      `;
      const yard = yards[0];

      if (!yard) {
        throw new HttpError(404, "YARD_NOT_FOUND", "The requested yard location was not found.");
      }

      if (!yard.is_active) {
        throw new HttpError(409, "YARD_UNAVAILABLE", "The requested yard location is inactive.");
      }

      const occupancy = await transaction.container.count({
        where: { currentYardId: yard.id }
      });

      if (occupancy >= yard.capacity) {
        throw new HttpError(
          409,
          "YARD_CAPACITY_FULL",
          "The requested yard location has no available capacity."
        );
      }

      const updated = await transaction.container.updateMany({
        where: {
          id: container.id,
          status: "IN_YARD",
          currentYardId: null
        },
        data: {
          status: "STORED",
          currentYardId: yard.id
        }
      });

      if (updated.count !== 1) {
        throw new HttpError(
          409,
          "INVALID_CONTAINER_STATE",
          "Container state changed before yard placement could be completed."
        );
      }

      await transaction.containerMovement.create({
        data: {
          containerId: container.id,
          actorId: actor.id,
          previousStatus: "IN_YARD",
          nextStatus: "STORED",
          toYardId: yard.id,
          toYardCode: yard.code,
          description: `Container placed in yard ${yard.code}`
        }
      });

      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action: "CONTAINER_PLACED",
          entityType: "CONTAINER",
          entityId: container.id,
          oldValue: {
            status: "IN_YARD",
            currentYardId: null
          },
          newValue: {
            status: "STORED",
            currentYardId: yard.id,
            yardCode: yard.code
          }
        }
      });

      return {
        container: {
          id: container.id,
          containerNumber: container.container_number,
          previousStatus: "IN_YARD",
          status: "STORED",
          yard: { id: yard.id, code: yard.code }
        }
      };
    });
  }

  async relocate(
    input: RelocateContainerInput,
    actor: YardActor
  ): Promise<YardPlacementResult> {
    return this.prisma.$transaction(async (transaction) => {
      const containers = await transaction.$queryRaw<LockedContainer[]>`
        SELECT "id", "container_number", "status", "current_yard_id"
        FROM "containers"
        WHERE "id" = ${input.containerId}
        FOR UPDATE
      `;
      const container = containers[0];

      if (!container) {
        throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
      }

      if (container.status !== "STORED" || container.current_yard_id === null) {
        throw new HttpError(
          409,
          "INVALID_CONTAINER_STATE",
          `Yard relocation requires a STORED container; the current status is ${container.status}.`
        );
      }

      const yards = await transaction.$queryRaw<LockedYard[]>`
        SELECT "id", "code", "capacity", "is_active"
        FROM "yards"
        WHERE "id" = ${container.current_yard_id}
           OR "code" = ${input.yardCode}
        ORDER BY "id"
        FOR UPDATE
      `;
      const sourceYard = yards.find((yard) => yard.id === container.current_yard_id);
      const targetYard = yards.find((yard) => yard.code === input.yardCode);

      if (!sourceYard) {
        throw new HttpError(409, "YARD_UNAVAILABLE", "The container's current yard is unavailable.");
      }

      if (!targetYard) {
        throw new HttpError(404, "YARD_NOT_FOUND", "The requested yard location was not found.");
      }

      if (targetYard.id === sourceYard.id) {
        throw new HttpError(
          409,
          "SAME_YARD_LOCATION",
          "The container is already stored at the requested yard location."
        );
      }

      if (!targetYard.is_active) {
        throw new HttpError(409, "YARD_UNAVAILABLE", "The requested yard location is inactive.");
      }

      const occupancy = await transaction.container.count({
        where: { currentYardId: targetYard.id }
      });

      if (occupancy >= targetYard.capacity) {
        throw new HttpError(
          409,
          "YARD_CAPACITY_FULL",
          "The requested yard location has no available capacity."
        );
      }

      const updated = await transaction.container.updateMany({
        where: {
          id: container.id,
          status: "STORED",
          currentYardId: sourceYard.id
        },
        data: { currentYardId: targetYard.id }
      });

      if (updated.count !== 1) {
        throw new HttpError(
          409,
          "INVALID_CONTAINER_STATE",
          "Container location changed before relocation could be completed."
        );
      }

      await transaction.containerMovement.create({
        data: {
          containerId: container.id,
          actorId: actor.id,
          previousStatus: "STORED",
          nextStatus: "STORED",
          fromYardId: sourceYard.id,
          fromYardCode: sourceYard.code,
          toYardId: targetYard.id,
          toYardCode: targetYard.code,
          description: `Container relocated from ${sourceYard.code} to ${targetYard.code}`
        }
      });

      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action: "CONTAINER_RELOCATED",
          entityType: "CONTAINER",
          entityId: container.id,
          oldValue: {
            status: "STORED",
            currentYardId: sourceYard.id,
            yardCode: sourceYard.code
          },
          newValue: {
            status: "STORED",
            currentYardId: targetYard.id,
            yardCode: targetYard.code
          }
        }
      });

      return {
        container: {
          id: container.id,
          containerNumber: container.container_number,
          previousStatus: "STORED",
          status: "STORED",
          yard: { id: targetYard.id, code: targetYard.code }
        }
      };
    });
  }
}
