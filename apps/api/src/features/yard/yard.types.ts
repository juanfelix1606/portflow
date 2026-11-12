import type { ContainerStatus } from "../../generated/prisma/client.ts";

export interface YardActor {
  id: string;
  email: string;
}

export interface PlaceContainerInput {
  containerId: string;
  yardCode: string;
}

export interface RelocateContainerInput {
  containerId: string;
  yardCode: string;
}

export interface ManagedYard {
  id: string;
  code: string;
  zone: string;
  capacity: number;
  occupied: number;
  isActive: boolean;
}

export interface UpdateYardInput {
  capacity?: number;
  isActive?: boolean;
}

export interface YardPlacementResult {
  container: {
    id: string;
    containerNumber: string;
    previousStatus: ContainerStatus;
    status: ContainerStatus;
    yard: {
      id: string;
      code: string;
    };
  };
}

export interface YardRepository {
  listYards(): Promise<ManagedYard[]>;
  updateYard(
    yardId: string,
    input: UpdateYardInput,
    actor: YardActor
  ): Promise<ManagedYard>;
  place(input: PlaceContainerInput, actor: YardActor): Promise<YardPlacementResult>;
  relocate(
    input: RelocateContainerInput,
    actor: YardActor
  ): Promise<YardPlacementResult>;
}
