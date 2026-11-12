import { Prisma } from "../../generated/prisma/client.ts";
import type { PrismaClient, RoleName } from "../../generated/prisma/client.ts";
import { HttpError } from "../../lib/http-error.ts";
import type {
  ManagedUser,
  PersistUserInput,
  UpdateUserInput,
  UserActor,
  UserListFilters,
  UserListResult,
  UserRepository
} from "./user.types.ts";
import { assertUserUpdateAllowed } from "./user-policy.ts";

const userSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { name: true } }
} satisfies Prisma.UserSelect;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function toManagedUser(user: {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  role: { name: RoleName };
}): ManagedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    role: user.role.name
  };
}

function auditValue(user: ManagedUser): Prisma.InputJsonObject {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listUsers(filters: UserListFilters): Promise<UserListResult> {
    const where: Prisma.UserWhereInput = {
      ...(filters.role ? { role: { is: { name: filters.role } } } : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { email: { contains: filters.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: userSelect
      }),
      this.prisma.user.count({ where })
    ]);

    return {
      data: users.map(toManagedUser),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit)
      }
    };
  }

  async createUser(input: PersistUserInput, actor: UserActor): Promise<ManagedUser> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const role = await transaction.role.findUnique({
          where: { name: input.role }
        });

        if (!role) {
          throw new HttpError(503, "ROLE_NOT_SEEDED", "Application roles have not been seeded.");
        }

        const created = await transaction.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash: input.passwordHash,
            roleId: role.id
          },
          select: userSelect
        });
        const user = toManagedUser(created);

        await transaction.auditLog.create({
          data: {
            actorId: actor.id,
            actorEmail: actor.email,
            action: "USER_CREATED",
            entityType: "USER",
            entityId: user.id,
            newValue: auditValue(user)
          }
        });

        return user;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists.");
      }

      throw error;
    }
  }

  async resetUserPassword(
    userId: string,
    passwordHash: string,
    actor: UserActor
  ): Promise<void> {
    await this.persistPasswordChange(userId, passwordHash, actor, true, "USER_PASSWORD_RESET");
  }

  async changeOwnPassword(
    userId: string,
    passwordHash: string,
    actor: UserActor
  ): Promise<void> {
    await this.persistPasswordChange(userId, passwordHash, actor, false, "USER_PASSWORD_CHANGED");
  }

  private async persistPasswordChange(
    userId: string,
    passwordHash: string,
    actor: UserActor,
    mustChangePassword: boolean,
    action: "USER_PASSWORD_RESET" | "USER_PASSWORD_CHANGED"
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const users = await transaction.$queryRaw<Array<{
        id: string;
        must_change_password: boolean;
      }>>`
        SELECT "id", "must_change_password"
        FROM "users"
        WHERE "id" = ${userId}
        FOR UPDATE
      `;

      if (users.length === 0) {
        throw new HttpError(404, "USER_NOT_FOUND", "The requested user was not found.");
      }
      if (action === "USER_PASSWORD_CHANGED" && !users[0]?.must_change_password) {
        throw new HttpError(
          409,
          "PASSWORD_CHANGE_NOT_REQUIRED",
          "A password change is not required for this account."
        );
      }

      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword, authVersion: { increment: 1 } }
      });

      await transaction.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });

      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action,
          entityType: "USER",
          entityId: userId,
          newValue: { passwordReset: action === "USER_PASSWORD_RESET", mustChangePassword }
        }
      });
    });
  }

  async updateUser(
    userId: string,
    input: UpdateUserInput,
    actor: UserActor
  ): Promise<ManagedUser> {
    return this.prisma.$transaction(async (transaction) => {
      const adminRoles = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "roles"
        WHERE "name" = 'ADMIN'::"role_name"
        FOR UPDATE
      `;

      if (adminRoles.length === 0) {
        throw new HttpError(503, "ROLE_NOT_SEEDED", "Application roles have not been seeded.");
      }

      const currentRecord = await transaction.user.findUnique({
        where: { id: userId },
        select: userSelect
      });

      if (!currentRecord) {
        throw new HttpError(404, "USER_NOT_FOUND", "The requested user was not found.");
      }

      const current = toManagedUser(currentRecord);
      const activeAdminCount = await transaction.user.count({
        where: { isActive: true, role: { is: { name: "ADMIN" } } }
      });

      assertUserUpdateAllowed(current, input, actor, activeAdminCount);

      const nextName = input.name ?? current.name;
      const nextRole = input.role ?? current.role;
      const nextIsActive = input.isActive ?? current.isActive;
      const changed =
        nextName !== current.name ||
        nextRole !== current.role ||
        nextIsActive !== current.isActive;

      if (!changed) {
        return current;
      }

      const updatedRecord = await transaction.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.role !== undefined ? { role: { connect: { name: input.role } } } : {})
        },
        select: userSelect
      });
      const updated = toManagedUser(updatedRecord);

      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action: "USER_UPDATED",
          entityType: "USER",
          entityId: updated.id,
          oldValue: auditValue(current),
          newValue: auditValue(updated)
        }
      });

      return updated;
    });
  }
}
