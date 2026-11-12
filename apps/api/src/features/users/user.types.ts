import type { RoleName } from "../../generated/prisma/client.ts";
import type { PublicUser } from "../auth/auth.types.ts";

export interface ManagedUser extends Omit<PublicUser, "mustChangePassword"> {
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserListFilters {
  page: number;
  limit: number;
  search?: string;
  role?: RoleName;
  isActive?: boolean;
}

export interface UserListResult {
  data: ManagedUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UserActor {
  id: string;
  email: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: RoleName;
}

export interface UpdateUserInput {
  name?: string;
  role?: RoleName;
  isActive?: boolean;
}

export interface PersistUserInput extends Omit<CreateUserInput, "password"> {
  passwordHash: string;
}

export interface UserRepository {
  listUsers(filters: UserListFilters): Promise<UserListResult>;
  createUser(input: PersistUserInput, actor: UserActor): Promise<ManagedUser>;
  resetUserPassword(
    userId: string,
    passwordHash: string,
    actor: UserActor
  ): Promise<void>;
  changeOwnPassword(
    userId: string,
    passwordHash: string,
    actor: UserActor
  ): Promise<void>;
  updateUser(
    userId: string,
    input: UpdateUserInput,
    actor: UserActor
  ): Promise<ManagedUser>;
}
