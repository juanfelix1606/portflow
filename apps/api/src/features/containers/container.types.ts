import type {
  ContainerSize,
  ContainerStatus,
  ContainerType,
  TradeType
} from "../../generated/prisma/client.ts";

export interface ContainerActor {
  id: string;
  email: string;
}

export interface RegisterContainerInput {
  containerNumber: string;
  size: ContainerSize;
  type: ContainerType;
  tradeType: TradeType;
}

export interface ContainerImportRow {
  rowNumber: number;
  input: RegisterContainerInput;
}

export interface ContainerImportIssue {
  row: number;
  column: string;
  message: string;
}

export class ContainerImportConflictError extends Error {
  constructor(readonly issues: ContainerImportIssue[]) {
    super("One or more container numbers are already registered.");
    this.name = "ContainerImportConflictError";
  }
}

export interface ContainerCompletionResult {
  id: string;
  containerNumber: string;
  previousStatus: "GATE_OUT";
  status: "COMPLETED";
}

export interface ContainerListFilters {
  page: number;
  limit: number;
  search?: string;
  status?: ContainerStatus;
  size?: ContainerSize;
  type?: ContainerType;
  tradeType?: TradeType;
  yardCode?: string;
  createdAtGte?: Date;
  createdAtLt?: Date;
}

export interface ContainerView {
  id: string;
  containerNumber: string;
  size: ContainerSize;
  type: ContainerType;
  tradeType: TradeType;
  status: ContainerStatus;
  currentYard: { id: string; code: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContainerListResult {
  data: ContainerView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ContainerMovementView {
  id: string;
  previousStatus: ContainerStatus | null;
  nextStatus: ContainerStatus;
  fromYard: { id: string; code: string } | null;
  toYard: { id: string; code: string } | null;
  description: string | null;
  occurredAt: Date;
  actor: { id: string; name: string };
}

export interface ContainerMovementListResult {
  data: ContainerMovementView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MovementListOptions {
  page: number;
  limit: number;
  occurredAtGte?: Date;
  occurredAtLt?: Date;
}

export interface ContainerRepository {
  register(input: RegisterContainerInput, actor: ContainerActor): Promise<ContainerView>;
  importMany(rows: ContainerImportRow[], actor: ContainerActor): Promise<ContainerView[]>;
  findExistingContainerNumbers(numbers: string[]): Promise<string[]>;
  complete(id: string, actor: ContainerActor): Promise<ContainerCompletionResult>;
  list(filters: ContainerListFilters): Promise<ContainerListResult>;
  findById(id: string): Promise<ContainerView | null>;
  listMovements(
    containerId: string,
    options: MovementListOptions
  ): Promise<ContainerMovementListResult>;
}
