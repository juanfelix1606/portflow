import { HttpError } from "../../lib/http-error.ts";
import type { ManagedUser, UpdateUserInput, UserActor } from "./user.types.ts";

export function assertUserUpdateAllowed(
  current: ManagedUser,
  input: UpdateUserInput,
  actor: UserActor,
  activeAdminCount: number
): void {
  const nextRole = input.role ?? current.role;
  const nextIsActive = input.isActive ?? current.isActive;
  const isRemovingActiveAdmin =
    current.role === "ADMIN" &&
    current.isActive &&
    (nextRole !== "ADMIN" || !nextIsActive);

  if (
    current.id === actor.id &&
    current.role === "ADMIN" &&
    (nextRole !== "ADMIN" || !nextIsActive)
  ) {
    throw new HttpError(
      409,
      "SELF_ADMIN_LOCKOUT",
      "Administrators cannot demote or deactivate their own account."
    );
  }

  if (isRemovingActiveAdmin && activeAdminCount <= 1) {
    throw new HttpError(
      409,
      "LAST_ACTIVE_ADMIN",
      "At least one active administrator must remain."
    );
  }
}
