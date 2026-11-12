import { HttpError } from "../src/lib/http-error.ts";
import type { MemoryContainerRepository } from "./memory-container-repository.ts";
import type {
  GateActor,
  GateInInput,
  GateInResult,
  GateOutResult,
  GateTransactionFilters,
  GateTransactionListResult,
  GateRepository
} from "../src/features/gate/gate.types.ts";

export class MemoryGateRepository implements GateRepository {
  readonly gateTransactions: Array<GateInResult | GateOutResult> = [];
  readonly history: GateTransactionListResult["data"] = [];
  readonly movements: Array<
    | {
        containerId: string;
        actorId: string;
        previousStatus: "REGISTERED";
        nextStatus: "IN_YARD";
      }
    | {
        containerId: string;
        actorId: string;
        previousStatus: "STORED";
        nextStatus: "GATE_OUT";
        fromYard: { id: string; code: string };
      }
  > = [];
  readonly auditEntries: Array<{
    action: string;
    entityId: string;
    actorId: string;
  }> = [];
  failBeforeCommit = false;
  private nextId = 1;

  constructor(private readonly containers: MemoryContainerRepository) {}

  async listTransactions(
    filters: GateTransactionFilters
  ): Promise<GateTransactionListResult> {
    const search = filters.search?.toLocaleLowerCase();
    const matching = this.history
      .filter((transaction) =>
        (!filters.direction || transaction.direction === filters.direction) &&
        (!filters.occurredAtGte || transaction.occurredAt >= filters.occurredAtGte) &&
        (!filters.occurredAtLt || transaction.occurredAt < filters.occurredAtLt) &&
        (!search || [
          transaction.container.containerNumber,
          transaction.vehiclePlate,
          transaction.driverName,
          transaction.operator.name
        ].some((value) => value.toLocaleLowerCase().includes(search)))
      )
      .sort((left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        left.id.localeCompare(right.id)
      );
    const start = (filters.page - 1) * filters.limit;

    return {
      data: matching.slice(start, start + filters.limit),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: matching.length,
        totalPages: Math.ceil(matching.length / filters.limit)
      }
    };
  }

  async gateIn(input: GateInInput, actor: GateActor): Promise<GateInResult> {
    const container = this.containers.containers.find(
      (candidate) => candidate.id === input.containerId
    );

    if (!container) {
      throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
    }

    if (
      this.gateTransactions.some(
        (transaction) => transaction.container.id === container.id && transaction.direction === "IN"
      )
    ) {
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

    const now = new Date();
    const gateTransaction: GateInResult = {
      id: `gate-in-${this.nextId}`,
      direction: "IN",
      vehiclePlate: input.vehiclePlate,
      driverName: input.driverName,
      occurredAt: now,
      container: {
        id: container.id,
        containerNumber: container.containerNumber,
        previousStatus: "REGISTERED",
        status: "IN_YARD"
      }
    };

    if (this.failBeforeCommit) {
      throw new Error("Fictional test failure before committing gate-in.");
    }

    this.nextId += 1;
    container.status = "IN_YARD";
    container.updatedAt = now;
    this.gateTransactions.push(gateTransaction);
    this.history.push({
      id: gateTransaction.id,
      direction: "IN",
      vehiclePlate: gateTransaction.vehiclePlate,
      driverName: gateTransaction.driverName,
      occurredAt: gateTransaction.occurredAt,
      container: {
        id: container.id,
        containerNumber: container.containerNumber
      },
      operator: { id: actor.id, name: actor.email }
    });
    this.movements.push({
      containerId: container.id,
      actorId: actor.id,
      previousStatus: "REGISTERED",
      nextStatus: "IN_YARD"
    });
    this.auditEntries.push({
      action: "GATE_IN_RECORDED",
      entityId: container.id,
      actorId: actor.id
    });
    this.containers.movementHistory.push({
      id: `movement-${this.containers.movementHistory.length + 1}`,
      containerId: container.id,
      previousStatus: "REGISTERED",
      nextStatus: "IN_YARD",
      fromYard: null,
      toYard: null,
      description: "Container entered through the gate",
      occurredAt: now,
      actor: { id: actor.id, name: actor.email }
    });

    return gateTransaction;
  }

  async gateOut(input: GateInInput, actor: GateActor): Promise<GateOutResult> {
    const container = this.containers.containers.find(
      (candidate) => candidate.id === input.containerId
    );

    if (!container) {
      throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
    }

    if (
      this.gateTransactions.some(
        (transaction) => transaction.container.id === container.id && transaction.direction === "OUT"
      )
    ) {
      throw new HttpError(
        409,
        "DUPLICATE_GATE_OUT",
        "This container already has a gate-out transaction."
      );
    }

    if (container.status !== "STORED" || !container.currentYard) {
      throw new HttpError(
        409,
        "INVALID_CONTAINER_STATE",
        `Gate-out requires a STORED container with a current yard location; the current status is ${container.status}.`
      );
    }

    const previousYard = container.currentYard;
    const now = new Date();
    const gateTransaction: GateOutResult = {
      id: `gate-out-${this.nextId}`,
      direction: "OUT",
      vehiclePlate: input.vehiclePlate,
      driverName: input.driverName,
      occurredAt: now,
      container: {
        id: container.id,
        containerNumber: container.containerNumber,
        previousStatus: "STORED",
        status: "GATE_OUT"
      }
    };

    if (this.failBeforeCommit) {
      throw new Error("Fictional test failure before committing gate-out.");
    }

    this.nextId += 1;
    container.status = "GATE_OUT";
    container.currentYard = null;
    container.updatedAt = now;
    this.gateTransactions.push(gateTransaction);
    this.history.push({
      id: gateTransaction.id,
      direction: "OUT",
      vehiclePlate: gateTransaction.vehiclePlate,
      driverName: gateTransaction.driverName,
      occurredAt: gateTransaction.occurredAt,
      container: {
        id: container.id,
        containerNumber: container.containerNumber
      },
      operator: { id: actor.id, name: actor.email }
    });
    this.movements.push({
      containerId: container.id,
      actorId: actor.id,
      previousStatus: "STORED",
      nextStatus: "GATE_OUT",
      fromYard: previousYard
    });
    this.auditEntries.push({
      action: "GATE_OUT_RECORDED",
      entityId: container.id,
      actorId: actor.id
    });
    this.containers.movementHistory.push({
      id: `movement-${this.containers.movementHistory.length + 1}`,
      containerId: container.id,
      previousStatus: "STORED",
      nextStatus: "GATE_OUT",
      fromYard: previousYard,
      toYard: null,
      description: "Container exited through the gate",
      occurredAt: now,
      actor: { id: actor.id, name: actor.email }
    });

    return gateTransaction;
  }
}
