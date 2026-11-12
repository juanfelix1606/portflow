import { describe, expect, it } from "vitest";
import { assertUserUpdateAllowed } from "../src/features/users/user-policy.ts";
import type { ManagedUser, UserActor } from "../src/features/users/user.types.ts";
import { HttpError } from "../src/lib/http-error.ts";

const admin: ManagedUser = {
  id: "admin-1",
  name: "Admin One",
  email: "admin@portflow.test",
  role: "ADMIN",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const otherAdmin: UserActor = {
  id: "admin-2",
  email: "admin2@portflow.test"
};

describe("admin account safeguards", () => {
  it("keeps at least one active administrator", () => {
    let thrown: unknown;

    try {
      assertUserUpdateAllowed(admin, { isActive: false }, otherAdmin, 1);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpError);
    if (thrown instanceof HttpError) {
      expect(thrown).toMatchObject({
        code: "LAST_ACTIVE_ADMIN",
        statusCode: 409
      });
    }
  });

  it("allows removing an admin while another active admin remains", () => {
    expect(() =>
      assertUserUpdateAllowed(admin, { role: "GATE_OPERATOR" }, otherAdmin, 2)
    ).not.toThrow();
  });
});
