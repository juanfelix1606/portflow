import { HttpError } from "../../lib/http-error.ts";
import { hashPassword } from "../auth/password.ts";
import type {
  CreateUserInput,
  UserActor,
  UserListFilters,
  UserRepository,
  UpdateUserInput
} from "./user.types.ts";

export class UserService {
  constructor(private readonly repository: UserRepository) {}

  list(filters: UserListFilters) {
    return this.repository.listUsers(filters);
  }

  async create(input: CreateUserInput, actor: UserActor) {
    const user = await this.repository.createUser(
      {
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: input.role
      },
      actor
    );

    return user;
  }

  async update(
    userId: string,
    input: UpdateUserInput,
    actor: UserActor
  ) {
    if (!userId) {
      throw new HttpError(400, "INVALID_USER_ID", "A user ID is required.");
    }

    return this.repository.updateUser(userId, input, actor);
  }

  async resetPassword(userId: string, password: string, actor: UserActor) {
    if (!userId) {
      throw new HttpError(400, "INVALID_USER_ID", "A user ID is required.");
    }

    await this.repository.resetUserPassword(userId, await hashPassword(password), actor);
  }

  async changeOwnPassword(userId: string, password: string, actor: UserActor) {
    if (!userId) {
      throw new HttpError(400, "INVALID_USER_ID", "A user ID is required.");
    }

    await this.repository.changeOwnPassword(userId, await hashPassword(password), actor);
  }
}
