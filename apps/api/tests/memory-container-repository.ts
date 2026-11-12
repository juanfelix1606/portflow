import { HttpError } from "../src/lib/http-error.ts";
import { ContainerImportConflictError } from "../src/features/containers/container.types.ts";
import type {
  ContainerActor,
  ContainerCompletionResult,
  ContainerMovementListResult,
  ContainerMovementView,
  ContainerImportIssue,
  ContainerImportRow,
  ContainerListFilters,
  ContainerListResult,
  ContainerRepository,
  ContainerView,
  MovementListOptions,
  RegisterContainerInput
} from "../src/features/containers/container.types.ts";

export interface MemoryMovementRecord extends ContainerMovementView {
  containerId: string;
}

export class MemoryContainerRepository implements ContainerRepository {
  readonly containers: ContainerView[];
  readonly movementHistory: MemoryMovementRecord[] = [];
  readonly movements: Array<{
    containerId: string;
    actorId: string;
    previousStatus: null;
    nextStatus: "REGISTERED";
  }> = [];
  readonly auditEntries: Array<{
    action: string;
    entityId: string;
    actorId: string;
  }> = [];
  failBeforeCompletionCommit = false;
  private nextId = 1;

  constructor(containers: ContainerView[] = []) {
    this.containers = containers;
  }

  async register(
    input: RegisterContainerInput,
    actor: ContainerActor
  ): Promise<ContainerView> {
    if (this.containers.some((container) => container.containerNumber === input.containerNumber)) {
      throw new HttpError(
        409,
        "CONTAINER_ALREADY_EXISTS",
        "A container with this number is already registered."
      );
    }

    const now = new Date();
    const container: ContainerView = {
      id: `container-${this.nextId++}`,
      containerNumber: input.containerNumber,
      size: input.size,
      type: input.type,
      tradeType: input.tradeType,
      status: "REGISTERED",
      currentYard: null,
      createdAt: now,
      updatedAt: now
    };

    this.containers.push(container);
    this.movements.push({
      containerId: container.id,
      actorId: actor.id,
      previousStatus: null,
      nextStatus: "REGISTERED"
    });
    this.movementHistory.push({
      id: `movement-${this.movementHistory.length + 1}`,
      containerId: container.id,
      previousStatus: null,
      nextStatus: "REGISTERED",
      fromYard: null,
      toYard: null,
      description: "Container registered",
      occurredAt: now,
      actor: { id: actor.id, name: actor.email }
    });
    this.auditEntries.push({
      action: "CONTAINER_REGISTERED",
      entityId: container.id,
      actorId: actor.id
    });

    return container;
  }

  async importMany(
    rows: ContainerImportRow[],
    actor: ContainerActor
  ): Promise<ContainerView[]> {
    const existingNumbers = new Set(
      this.containers.map((container) => container.containerNumber)
    );
    const duplicateIssues: ContainerImportIssue[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      if (existingNumbers.has(row.input.containerNumber)) {
        duplicateIssues.push({
          row: row.rowNumber,
          column: "containerNumber",
          message: "This container number is already registered."
        });
      } else if (seen.has(row.input.containerNumber)) {
        duplicateIssues.push({
          row: row.rowNumber,
          column: "containerNumber",
          message: "This container number appears more than once in the CSV."
        });
      }
      seen.add(row.input.containerNumber);
    }

    if (duplicateIssues.length > 0) {
      throw new ContainerImportConflictError(duplicateIssues);
    }

    const imported = rows.map(({ input }) => {
      const now = new Date();
      return {
        id: `container-${this.nextId++}`,
        containerNumber: input.containerNumber,
        size: input.size,
        type: input.type,
        tradeType: input.tradeType,
        status: "REGISTERED" as const,
        currentYard: null,
        createdAt: now,
        updatedAt: now
      };
    });

    this.containers.push(...imported);
    for (const container of imported) {
      this.movements.push({
        containerId: container.id,
        actorId: actor.id,
        previousStatus: null,
        nextStatus: "REGISTERED"
      });
      this.movementHistory.push({
        id: `movement-${this.movementHistory.length + 1}`,
        containerId: container.id,
        previousStatus: null,
        nextStatus: "REGISTERED",
        fromYard: null,
        toYard: null,
        description: "Container imported from CSV",
        occurredAt: container.createdAt,
        actor: { id: actor.id, name: actor.email }
      });
      this.auditEntries.push({
        action: "CONTAINER_REGISTERED",
        entityId: container.id,
        actorId: actor.id
      });
    }

    return imported;
  }

  async findExistingContainerNumbers(numbers: string[]): Promise<string[]> {
    const requested = new Set(numbers);
    return this.containers
      .filter((container) => requested.has(container.containerNumber))
      .map((container) => container.containerNumber);
  }

  async list(filters: ContainerListFilters): Promise<ContainerListResult> {
    const matches = this.containers
      .filter((container) => filters.status === undefined || container.status === filters.status)
      .filter((container) => filters.size === undefined || container.size === filters.size)
      .filter((container) => filters.type === undefined || container.type === filters.type)
      .filter(
        (container) =>
          filters.yardCode === undefined || container.currentYard?.code === filters.yardCode
      )
      .filter(
        (container) =>
          filters.createdAtGte === undefined ||
          container.createdAt.getTime() >= filters.createdAtGte.getTime()
      )
      .filter(
        (container) =>
          filters.createdAtLt === undefined ||
          container.createdAt.getTime() < filters.createdAtLt.getTime()
      )
      .filter(
        (container) =>
          filters.tradeType === undefined || container.tradeType === filters.tradeType
      )
      .filter(
        (container) =>
          filters.search === undefined ||
          container.containerNumber.toUpperCase().includes(filters.search.toUpperCase())
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const start = (filters.page - 1) * filters.limit;
    const data = matches.slice(start, start + filters.limit);

    return {
      data,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: matches.length,
        totalPages: Math.ceil(matches.length / filters.limit)
      }
    };
  }

  async findById(id: string): Promise<ContainerView | null> {
    return this.containers.find((container) => container.id === id) ?? null;
  }

  async complete(id: string, actor: ContainerActor): Promise<ContainerCompletionResult> {
    const container = this.containers.find((candidate) => candidate.id === id);

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

    if (container.status !== "GATE_OUT" || container.currentYard !== null) {
      throw new HttpError(
        409,
        "INVALID_CONTAINER_STATE",
        "Only a container that has exited the gate can be completed."
      );
    }

    if (this.failBeforeCompletionCommit) {
      throw new Error("Fictional test failure before committing container completion.");
    }

    const now = new Date();
    container.status = "COMPLETED";
    container.updatedAt = now;
    this.movementHistory.push({
      id: `movement-${this.movementHistory.length + 1}`,
      containerId: container.id,
      previousStatus: "GATE_OUT",
      nextStatus: "COMPLETED",
      fromYard: null,
      toYard: null,
      description: "Container lifecycle completed",
      occurredAt: now,
      actor: { id: actor.id, name: actor.email }
    });
    this.auditEntries.push({
      action: "CONTAINER_COMPLETED",
      entityId: container.id,
      actorId: actor.id
    });

    return {
      id: container.id,
      containerNumber: container.containerNumber,
      previousStatus: "GATE_OUT",
      status: "COMPLETED"
    };
  }

  async listMovements(
    containerId: string,
    options: MovementListOptions
  ): Promise<ContainerMovementListResult> {
    const matches = this.movementHistory
      .filter((movement) => movement.containerId === containerId)
      .filter((movement) =>
        (options.occurredAtGte === undefined ||
          movement.occurredAt >= options.occurredAtGte) &&
        (options.occurredAtLt === undefined ||
          movement.occurredAt < options.occurredAtLt)
      )
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
    const start = (options.page - 1) * options.limit;
    const data = matches.slice(start, start + options.limit).map((movement) => ({
      id: movement.id,
      previousStatus: movement.previousStatus,
      nextStatus: movement.nextStatus,
      fromYard: movement.fromYard,
      toYard: movement.toYard,
      description: movement.description,
      occurredAt: movement.occurredAt,
      actor: movement.actor
    }));

    return {
      data,
      pagination: {
        page: options.page,
        limit: options.limit,
        total: matches.length,
        totalPages: Math.ceil(matches.length / options.limit)
      }
    };
  }
}
