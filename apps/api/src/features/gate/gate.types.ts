import type { ContainerStatus } from "../../generated/prisma/client.ts";

export interface GateActor {
  id: string;
  email: string;
}

export interface GateInInput {
  containerId: string;
  vehiclePlate: string;
  driverName: string;
}

export interface GateInResult {
  id: string;
  direction: "IN";
  vehiclePlate: string;
  driverName: string;
  occurredAt: Date;
  container: {
    id: string;
    containerNumber: string;
    previousStatus: ContainerStatus;
    status: ContainerStatus;
  };
}

export interface GateOutResult {
  id: string;
  direction: "OUT";
  vehiclePlate: string;
  driverName: string;
  occurredAt: Date;
  container: {
    id: string;
    containerNumber: string;
    previousStatus: ContainerStatus;
    status: ContainerStatus;
  };
}

export interface GateTransactionFilters {
  page: number;
  limit: number;
  search?: string;
  direction?: "IN" | "OUT";
  occurredAtGte?: Date;
  occurredAtLt?: Date;
}

export interface GateTransactionRecord {
  id: string;
  direction: "IN" | "OUT";
  vehiclePlate: string;
  driverName: string;
  occurredAt: Date;
  container: {
    id: string;
    containerNumber: string;
  };
  operator: {
    id: string;
    name: string;
  };
}

export interface GateTransactionListResult {
  data: GateTransactionRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface GateRepository {
  gateIn(input: GateInInput, actor: GateActor): Promise<GateInResult>;
  gateOut(input: GateInInput, actor: GateActor): Promise<GateOutResult>;
  listTransactions(filters: GateTransactionFilters): Promise<GateTransactionListResult>;
}
