import { HttpError } from "../src/lib/http-error.ts";
import { assertUserUpdateAllowed } from "../src/features/users/user-policy.ts";
import type {
  ManagedUser,
  PersistUserInput,
  UpdateUserInput,
  UserActor,
  UserListFilters,
  UserListResult,
  UserRepository
} from "../src/features/users/user.types.ts";

export class MemoryUserRepository implements UserRepository {
  readonly users: ManagedUser[];
  readonly auditEntries: Array<{ action: string; entityId: string; actorId: string }> = [];
  readonly passwordHashes = new Map<string, string>();
  private nextId = 1;

  constructor(
    users: ManagedUser[] = [],
    private readonly onPasswordChange?: (
      userId: string,
      passwordHash: string,
      mustChangePassword: boolean
    ) => void
  ) {
    this.users = users;
  }

  async listUsers(filters: UserListFilters): Promise<UserListResult> {
    const matches = this.users
      .filter((user) => filters.role === undefined || user.role === filters.role)
      .filter((user) => filters.isActive === undefined || user.isActive === filters.isActive)
      .filter((user) => {
        const search = filters.search?.toLowerCase();
        return (
          search === undefined ||
          user.name.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search)
        );
      })
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
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

  async createUser(input: PersistUserInput, actor: UserActor): Promise<ManagedUser> {
    if (this.users.some((user) => user.email === input.email)) {
      throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists.");
    }

    const now = new Date();
    const user: ManagedUser = {
      id: `managed-${this.nextId++}`,
      name: input.name,
      email: input.email,
      role: input.role,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    this.users.push(user);
    this.passwordHashes.set(user.id, input.passwordHash);
    this.auditEntries.push({ action: "USER_CREATED", entityId: user.id, actorId: actor.id });
    return user;
  }

  async resetUserPassword(
    userId: string,
    passwordHash: string,
    actor: UserActor
  ): Promise<void> {
    await this.changePassword(userId, passwordHash, actor, true, "USER_PASSWORD_RESET");
  }

  async changeOwnPassword(
    userId: string,
    passwordHash: string,
    actor: UserActor
  ): Promise<void> {
    await this.changePassword(userId, passwordHash, actor, false, "USER_PASSWORD_CHANGED");
  }

  private async changePassword(
    userId: string,
    passwordHash: string,
    actor: UserActor,
    mustChangePassword: boolean,
    action: "USER_PASSWORD_RESET" | "USER_PASSWORD_CHANGED"
  ): Promise<void> {
    if (!this.users.some((user) => user.id === userId)) {
      throw new HttpError(404, "USER_NOT_FOUND", "The requested user was not found.");
    }

    this.passwordHashes.set(userId, passwordHash);
    this.onPasswordChange?.(userId, passwordHash, mustChangePassword);
    this.auditEntries.push({
      action,
      entityId: userId,
      actorId: actor.id
    });
  }

  async updateUser(
    userId: string,
    input: UpdateUserInput,
    actor: UserActor
  ): Promise<ManagedUser> {
    const user = this.users.find((candidate) => candidate.id === userId);

    if (!user) {
      throw new HttpError(404, "USER_NOT_FOUND", "The requested user was not found.");
    }

    const activeAdminCount = this.users.filter(
      (candidate) => candidate.isActive && candidate.role === "ADMIN"
    ).length;

    assertUserUpdateAllowed(user, input, actor, activeAdminCount);

    const changed =
      (input.name !== undefined && input.name !== user.name) ||
      (input.role !== undefined && input.role !== user.role) ||
      (input.isActive !== undefined && input.isActive !== user.isActive);

    if (!changed) {
      return user;
    }

    Object.assign(user, input, { updatedAt: new Date() });
    this.auditEntries.push({ action: "USER_UPDATED", entityId: user.id, actorId: actor.id });

    return user;
  }
}
