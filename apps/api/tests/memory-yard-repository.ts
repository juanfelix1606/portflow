import { HttpError } from "../src/lib/http-error.ts";
import type {
  PlaceContainerInput,
  RelocateContainerInput,
  ManagedYard,
  YardActor,
  YardPlacementResult,
  UpdateYardInput,
  YardRepository
} from "../src/features/yard/yard.types.ts";
import type { MemoryContainerRepository } from "./memory-container-repository.ts";

export interface TestYardLocation {
  id: string;
  code: string;
  capacity: number;
  isActive: boolean;
}

export class MemoryYardRepository implements YardRepository {
  readonly movements: Array<{
    containerId: string;
    actorId: string;
    previousStatus: "IN_YARD";
    nextStatus: "STORED";
    toYardId: string;
    toYardCode: string;
  } | {
    containerId: string;
    actorId: string;
    previousStatus: "STORED";
    nextStatus: "STORED";
    fromYardId: string;
    fromYardCode: string;
    toYardId: string;
    toYardCode: string;
  }> = [];
  readonly auditEntries: Array<{
    action: string;
    entityId: string;
    actorId: string;
  }> = [];
  failBeforeCommit = false;

  constructor(
    private readonly containers: MemoryContainerRepository,
    readonly yards: TestYardLocation[] = [
      { id: "yard-a-01", code: "A-01", capacity: 100, isActive: true },
      { id: "yard-b-01", code: "B-01", capacity: 100, isActive: true }
    ]
  ) {}

  async listYards(): Promise<ManagedYard[]> {
    return this.yards
      .map((yard) => ({
        id: yard.id,
        code: yard.code,
        zone: yard.code.split("-")[0] ?? "",
        capacity: yard.capacity,
        occupied: this.containers.containers.filter(
          (candidate) => candidate.currentYard?.id === yard.id
        ).length,
        isActive: yard.isActive
      }))
      .sort((left, right) => left.zone.localeCompare(right.zone) || left.code.localeCompare(right.code));
  }

  async updateYard(
    yardId: string,
    input: UpdateYardInput,
    actor: YardActor
  ): Promise<ManagedYard> {
    const yard = this.yards.find((candidate) => candidate.id === yardId);

    if (!yard) {
      throw new HttpError(404, "YARD_NOT_FOUND", "The requested yard location was not found.");
    }

    const occupied = this.containers.containers.filter(
      (candidate) => candidate.currentYard?.id === yard.id
    ).length;
    const capacity = input.capacity ?? yard.capacity;
    const isActive = input.isActive ?? yard.isActive;

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

    const changed = capacity !== yard.capacity || isActive !== yard.isActive;
    yard.capacity = capacity;
    yard.isActive = isActive;

    if (changed) {
      this.auditEntries.push({
        action: "YARD_UPDATED",
        entityId: yard.id,
        actorId: actor.id
      });
    }

    return {
      id: yard.id,
      code: yard.code,
      zone: yard.code.split("-")[0] ?? "",
      capacity,
      occupied,
      isActive
    };
  }

  async place(
    input: PlaceContainerInput,
    actor: YardActor
  ): Promise<YardPlacementResult> {
    const container = this.containers.containers.find(
      (candidate) => candidate.id === input.containerId
    );

    if (!container) {
      throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
    }

    if (container.status !== "IN_YARD" || container.currentYard !== null) {
      throw new HttpError(
        409,
        "INVALID_CONTAINER_STATE",
        `Yard placement requires an unplaced IN_YARD container; the current status is ${container.status}.`
      );
    }

    const yard = this.yards.find((candidate) => candidate.code === input.yardCode);

    if (!yard) {
      throw new HttpError(404, "YARD_NOT_FOUND", "The requested yard location was not found.");
    }

    if (!yard.isActive) {
      throw new HttpError(409, "YARD_UNAVAILABLE", "The requested yard location is inactive.");
    }

    const occupancy = this.containers.containers.filter(
      (candidate) => candidate.currentYard?.id === yard.id
    ).length;

    if (occupancy >= yard.capacity) {
      throw new HttpError(
        409,
        "YARD_CAPACITY_FULL",
        "The requested yard location has no available capacity."
      );
    }

    const result: YardPlacementResult = {
      container: {
        id: container.id,
        containerNumber: container.containerNumber,
        previousStatus: "IN_YARD",
        status: "STORED",
        yard: { id: yard.id, code: yard.code }
      }
    };

    if (this.failBeforeCommit) {
      throw new Error("Fictional test failure before committing yard placement.");
    }

    const now = new Date();
    container.status = "STORED";
    container.currentYard = { id: yard.id, code: yard.code };
    container.updatedAt = now;
    this.movements.push({
      containerId: container.id,
      actorId: actor.id,
      previousStatus: "IN_YARD",
      nextStatus: "STORED",
      toYardId: yard.id,
      toYardCode: yard.code
    });
    this.auditEntries.push({
      action: "CONTAINER_PLACED",
      entityId: container.id,
      actorId: actor.id
    });
    this.containers.movementHistory.push({
      id: `movement-${this.containers.movementHistory.length + 1}`,
      containerId: container.id,
      previousStatus: "IN_YARD",
      nextStatus: "STORED",
      fromYard: null,
      toYard: { id: yard.id, code: yard.code },
      description: `Container placed in yard ${yard.code}`,
      occurredAt: now,
      actor: { id: actor.id, name: actor.email }
    });

    return result;
  }

  async relocate(
    input: RelocateContainerInput,
    actor: YardActor
  ): Promise<YardPlacementResult> {
    const container = this.containers.containers.find(
      (candidate) => candidate.id === input.containerId
    );

    if (!container) {
      throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
    }

    if (container.status !== "STORED" || container.currentYard === null) {
      throw new HttpError(
        409,
        "INVALID_CONTAINER_STATE",
        `Yard relocation requires a STORED container; the current status is ${container.status}.`
      );
    }

    const sourceYard = this.yards.find((candidate) => candidate.id === container.currentYard?.id);
    const targetYard = this.yards.find((candidate) => candidate.code === input.yardCode);

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

    if (!targetYard.isActive) {
      throw new HttpError(409, "YARD_UNAVAILABLE", "The requested yard location is inactive.");
    }

    const occupancy = this.containers.containers.filter(
      (candidate) => candidate.currentYard?.id === targetYard.id
    ).length;

    if (occupancy >= targetYard.capacity) {
      throw new HttpError(
        409,
        "YARD_CAPACITY_FULL",
        "The requested yard location has no available capacity."
      );
    }

    const result: YardPlacementResult = {
      container: {
        id: container.id,
        containerNumber: container.containerNumber,
        previousStatus: "STORED",
        status: "STORED",
        yard: { id: targetYard.id, code: targetYard.code }
      }
    };

    if (this.failBeforeCommit) {
      throw new Error("Fictional test failure before committing yard relocation.");
    }

    const now = new Date();
    container.currentYard = { id: targetYard.id, code: targetYard.code };
    container.updatedAt = now;
    this.movements.push({
      containerId: container.id,
      actorId: actor.id,
      previousStatus: "STORED",
      nextStatus: "STORED",
      fromYardId: sourceYard.id,
      fromYardCode: sourceYard.code,
      toYardId: targetYard.id,
      toYardCode: targetYard.code
    });
    this.auditEntries.push({
      action: "CONTAINER_RELOCATED",
      entityId: container.id,
      actorId: actor.id
    });
    this.containers.movementHistory.push({
      id: `movement-${this.containers.movementHistory.length + 1}`,
      containerId: container.id,
      previousStatus: "STORED",
      nextStatus: "STORED",
      fromYard: { id: sourceYard.id, code: sourceYard.code },
      toYard: { id: targetYard.id, code: targetYard.code },
      description: `Container relocated from ${sourceYard.code} to ${targetYard.code}`,
      occurredAt: now,
      actor: { id: actor.id, name: actor.email }
    });

    return result;
  }
}
