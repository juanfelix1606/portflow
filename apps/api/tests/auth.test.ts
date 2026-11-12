import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import type { AuthConfig } from "../src/config/auth-config.ts";
import { requireAuthentication, requireRoles } from "../src/features/auth/auth.middleware.ts";
import { AuthService } from "../src/features/auth/auth.service.ts";
import type { CredentialUser } from "../src/features/auth/auth.types.ts";
import { hashPassword } from "../src/features/auth/password.ts";
import { MemoryAuthRepository } from "./memory-auth-repository.ts";

const authConfig: AuthConfig = {
  accessTokenAudience: "portflow-web",
  accessTokenIssuer: "portflow-api",
  accessTokenSecret: new TextEncoder().encode("a-test-secret-long-enough-for-hs256"),
  accessTokenTtlSeconds: 900,
  isProduction: false,
  refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  webOrigin: "http://localhost:5173"
};

let adminUser: CredentialUser;
let gateUser: CredentialUser;

beforeAll(async () => {
  const passwordHash = await hashPassword("FictionalDemoPassword#1");

  adminUser = {
    id: "admin-1",
    name: "Demo Administrator",
    email: "admin@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "ADMIN" }
  };
  gateUser = {
    id: "gate-1",
    name: "Demo Gate Operator",
    email: "gate@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "GATE_OPERATOR" }
  };
});

describe("authentication service", () => {
  it("normalizes login email and rotates opaque refresh tokens", async () => {
    const repository = new MemoryAuthRepository([adminUser]);
    const service = new AuthService(repository, authConfig);
    const initial = await service.login(" ADMIN@PORTFLOW.TEST ", "FictionalDemoPassword#1");

    expect(initial.user.role).toBe("ADMIN");
    expect(initial.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const rotated = await service.refresh(initial.refreshToken);

    expect(rotated.refreshToken).not.toBe(initial.refreshToken);
    await expect(service.refresh(initial.refreshToken)).rejects.toMatchObject({
      statusCode: 401
    });
  });

  it("returns the same authentication error for unknown users and wrong passwords", async () => {
    const service = new AuthService(
      new MemoryAuthRepository([adminUser]),
      authConfig
    );

    await expect(service.login("missing@portflow.test", "wrong-password")).rejects.toMatchObject({
      statusCode: 401,
      message: "Email or password is incorrect."
    });
    await expect(service.login(adminUser.email, "wrong-password")).rejects.toMatchObject({
      statusCode: 401,
      message: "Email or password is incorrect."
    });
  });
});

describe("authentication and role middleware", () => {
  it("rejects unauthenticated requests and blocks disallowed roles", async () => {
    const repository = new MemoryAuthRepository([adminUser, gateUser]);
    const service = new AuthService(repository, authConfig);
    const gateSession = await service.login(gateUser.email, "FictionalDemoPassword#1");
    const adminSession = await service.login(adminUser.email, "FictionalDemoPassword#1");
    const app = express();

    app.get(
      "/admin",
      requireAuthentication(repository, authConfig),
      requireRoles("ADMIN"),
      (_request, response) => response.sendStatus(204)
    );

    await request(app).get("/admin").expect(401);
    await request(app)
      .get("/admin")
      .set("Authorization", `Bearer ${gateSession.accessToken}`)
      .expect(403);
    await request(app)
      .get("/admin")
      .set("Authorization", `Bearer ${adminSession.accessToken}`)
      .expect(204);
  });
});
