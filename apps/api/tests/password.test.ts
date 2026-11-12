import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/features/auth/password.ts";

describe("password hashing", () => {
  it("uses a unique salted hash and verifies only the matching password", async () => {
    const firstHash = await hashPassword("FictionalDemoPassword#1");
    const secondHash = await hashPassword("FictionalDemoPassword#1");

    expect(firstHash).not.toContain("FictionalDemoPassword#1");
    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword("FictionalDemoPassword#1", firstHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", firstHash)).resolves.toBe(false);
    await expect(verifyPassword("anything", "not-a-valid-hash")).resolves.toBe(false);
  });
});
