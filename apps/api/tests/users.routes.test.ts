import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { AuthConfig } from "../src/config/auth-config.ts";
import { AuthService } from "../src/features/auth/auth.service.ts";
import type { CredentialUser } from "../src/features/auth/auth.types.ts";
import { hashPassword, verifyPassword } from "../src/features/auth/password.ts";
import { MemoryAuthRepository } from "./memory-auth-repository.ts";
import { MemoryUserRepository } from "./memory-user-repository.ts";
import { MemoryContainerRepository } from "./memory-container-repository.ts";
import { MemoryGateRepository } from "./memory-gate-repository.ts";
import { MemoryYardRepository } from "./memory-yard-repository.ts";
import { emptyDashboardRepository } from "./memory-dashboard-repository.ts";
import { emptyAuditRepository } from "./memory-audit-repository.ts";
import type { ManagedUser } from "../src/features/users/user.types.ts";

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
let managedAdmin: ManagedUser;

beforeAll(async () => {
  const passwordHash = await hashPassword("FictionalDemoPassword#1");
  const now = new Date();

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
  managedAdmin = {
    id: adminUser.id,
    name: adminUser.name,
    email: adminUser.email,
    isActive: true,
    role: "ADMIN",
    createdAt: now,
    updatedAt: now
  };
});

describe("admin user routes", () => {
  it("restricts access and creates searchable users without exposing password data", async () => {
    const authRepository = new MemoryAuthRepository([adminUser, gateUser]);
    const userRepository = new MemoryUserRepository([managedAdmin]);
    const containerRepository = new MemoryContainerRepository();
    const app = createApp({
      authConfig,
      authRepository,
      userRepository,
      containerRepository,
      gateRepository: new MemoryGateRepository(containerRepository),
      yardRepository: new MemoryYardRepository(containerRepository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });
    const authService = new AuthService(authRepository, authConfig);
    const adminSession = await authService.login(adminUser.email, "FictionalDemoPassword#1");
    const gateSession = await authService.login(gateUser.email, "FictionalDemoPassword#1");

    await request(app).get("/api/v1/users").expect(401);
    await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${gateSession.accessToken}`)
      .expect(403);
    await request(app).get("/api/v1/users/export").expect(401);
    await request(app)
      .get("/api/v1/users/export")
      .set("Authorization", `Bearer ${gateSession.accessToken}`)
      .expect(403);

    const created = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${adminSession.accessToken}`)
      .send({
        name: "Yard Team Member",
        email: " YARD.OPERATOR@PORTFLOW.TEST ",
        password: "FictionalYardPassword#2",
        role: "YARD_OPERATOR"
      })
      .expect(201);

    expect(created.body.user.email).toBe("yard.operator@portflow.test");
    expect(created.body.user.role).toBe("YARD_OPERATOR");
    expect(created.body.user).not.toHaveProperty("passwordHash");
    expect(created.body.user).not.toHaveProperty("password");

    const storedHash = userRepository.passwordHashes.get(created.body.user.id);
    expect(storedHash).toBeDefined();
    if (storedHash) {
      await expect(
        verifyPassword("FictionalYardPassword#2", storedHash)
      ).resolves.toBe(true);
    }

    const list = await request(app)
      .get("/api/v1/users?role=YARD_OPERATOR&search=yard&limit=1")
      .set("Authorization", `Bearer ${adminSession.accessToken}`)
      .expect(200);

    expect(list.body.data).toHaveLength(1);
    expect(list.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1
    });

    await request(app)
      .patch(`/api/v1/users/${created.body.user.id}`)
      .set("Authorization", `Bearer ${adminSession.accessToken}`)
      .send({ isActive: false })
      .expect(200);

    const exported = await request(app)
      .get("/api/v1/users/export?role=YARD_OPERATOR&search=yard&isActive=false")
      .set("Authorization", `Bearer ${adminSession.accessToken}`)
      .expect(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.headers["content-disposition"]).toContain("portflow-managed-users.csv");
    expect(exported.text).toContain('"userId","name","email","role","isActive","createdAt","updatedAt"');
    expect(exported.text).toContain('"managed-1","Yard Team Member","yard.operator@portflow.test","YARD_OPERATOR","false"');
    expect(exported.text).not.toContain("passwordHash");
    expect(exported.text).not.toContain("FictionalYardPassword");

    expect(userRepository.auditEntries.map((entry) => entry.action)).toEqual([
      "USER_CREATED",
      "USER_UPDATED"
    ]);
  });

  it("exports every matching user across batches without credential fields", async () => {
    const now = new Date("2026-02-01T00:00:00.000Z");
    const users: ManagedUser[] = Array.from({ length: 501 }, (_value, index) => ({
      id: `bulk-user-${index}`,
      name: `Demo User ${index}`,
      email: `demo-user-${index}@portflow.test`,
      role: "GATE_OPERATOR",
      isActive: true,
      createdAt: now,
      updatedAt: now
    }));
    const authRepository = new MemoryAuthRepository([adminUser, gateUser]);
    const userRepository = new MemoryUserRepository(users);
    const containerRepository = new MemoryContainerRepository();
    const app = createApp({
      authConfig,
      authRepository,
      userRepository,
      containerRepository,
      gateRepository: new MemoryGateRepository(containerRepository),
      yardRepository: new MemoryYardRepository(containerRepository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });
    const adminSession = await new AuthService(authRepository, authConfig).login(
      adminUser.email,
      "FictionalDemoPassword#1"
    );

    const response = await request(app)
      .get("/api/v1/users/export")
      .set("Authorization", `Bearer ${adminSession.accessToken}`)
      .expect(200);
    const rows = response.text.split("\r\n").filter(Boolean);

    expect(rows).toHaveLength(502);
    expect(rows.at(-1)).toContain("demo-user-500@portflow.test");
    expect(response.text).not.toContain("passwordHash");
    expect(response.text).not.toContain("token");
  });

  it("resets a password, audits the action, and revokes existing sessions", async () => {
    const managedGate: ManagedUser = {
      id: gateUser.id,
      name: gateUser.name,
      email: gateUser.email,
      isActive: true,
      role: "GATE_OPERATOR",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    };
    const authRepository = new MemoryAuthRepository([adminUser, gateUser]);
    const userRepository = new MemoryUserRepository(
      [managedAdmin, managedGate],
      (userId, passwordHash, mustChangePassword) =>
        authRepository.changeUserPassword(userId, passwordHash, mustChangePassword, new Date())
    );
    const containerRepository = new MemoryContainerRepository();
    const app = createApp({
      authConfig,
      authRepository,
      userRepository,
      containerRepository,
      gateRepository: new MemoryGateRepository(containerRepository),
      yardRepository: new MemoryYardRepository(containerRepository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });
    const authService = new AuthService(authRepository, authConfig);
    const adminSession = await authService.login(adminUser.email, "FictionalDemoPassword#1");
    const gateSession = await authService.login(gateUser.email, "FictionalDemoPassword#1");

    await request(app)
      .patch(`/api/v1/users/${gateUser.id}/password`)
      .send({ password: "FictionalResetPassword#3" })
      .expect(401);
    await request(app)
      .patch(`/api/v1/users/${gateUser.id}/password`)
      .set("Authorization", `Bearer ${gateSession.accessToken}`)
      .send({ password: "FictionalResetPassword#3" })
      .expect(403);
    await request(app)
      .patch(`/api/v1/users/${gateUser.id}/password`)
      .set("Authorization", `Bearer ${adminSession.accessToken}`)
      .send({ password: "short" })
      .expect(400);

    const reset = await request(app)
      .patch(`/api/v1/users/${gateUser.id}/password`)
      .set("Authorization", `Bearer ${adminSession.accessToken}`)
      .send({ password: "FictionalResetPassword#3" })
      .expect(200);
    expect(reset.body).toEqual({ reset: true });
    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${gateSession.accessToken}`)
      .expect(401);
    expect(userRepository.auditEntries).toContainEqual({
      action: "USER_PASSWORD_RESET",
      entityId: gateUser.id,
      actorId: adminUser.id
    });
    await request(app)
      .patch("/api/v1/users/missing/password")
      .set("Authorization", `Bearer ${adminSession.accessToken}`)
      .send({ password: "FictionalResetPassword#3" })
      .expect(404);

    const storedHash = userRepository.passwordHashes.get(gateUser.id);
    expect(storedHash).toBeDefined();
    if (storedHash) {
      await expect(verifyPassword("FictionalResetPassword#3", storedHash)).resolves.toBe(true);
    }

    await expect(authService.refresh(gateSession.refreshToken)).rejects.toMatchObject({
      statusCode: 401
    });
    await expect(
      authService.login(gateUser.email, "FictionalDemoPassword#1")
    ).rejects.toMatchObject({ statusCode: 401 });
    const forcedSession = await authService.login(gateUser.email, "FictionalResetPassword#3");
    expect(forcedSession.user).toMatchObject({
      id: gateUser.id,
      mustChangePassword: true
    });
    const blocked = await request(app)
      .get("/api/v1/containers")
      .set("Authorization", `Bearer ${forcedSession.accessToken}`)
      .expect(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const csrfToken = "A".repeat(43);
    await request(app)
      .post("/api/v1/auth/password/change")
      .set("Authorization", `Bearer ${forcedSession.accessToken}`)
      .set("Origin", authConfig.webOrigin)
      .set("Cookie", `portflow_csrf=${csrfToken}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ password: "FictionalPermanentPassword#4" })
      .expect(200);
    expect(userRepository.auditEntries).toContainEqual({
      action: "USER_PASSWORD_CHANGED",
      entityId: gateUser.id,
      actorId: gateUser.id
    });
    await expect(authService.refresh(forcedSession.refreshToken)).rejects.toMatchObject({
      statusCode: 401
    });
    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${forcedSession.accessToken}`)
      .expect(401);
    await expect(
      authService.login(gateUser.email, "FictionalResetPassword#3")
    ).rejects.toMatchObject({ statusCode: 401 });
    const permanentSession = await authService.login(
      gateUser.email,
      "FictionalPermanentPassword#4"
    );
    expect(permanentSession.user).toMatchObject({
      id: gateUser.id,
      mustChangePassword: false
    });
    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${permanentSession.accessToken}`)
      .expect(200);
  });

  it("prevents an administrator from disabling or demoting their own account", async () => {
    const authRepository = new MemoryAuthRepository([adminUser]);
    const userRepository = new MemoryUserRepository([managedAdmin]);
    const containerRepository = new MemoryContainerRepository();
    const app = createApp({
      authConfig,
      authRepository,
      userRepository,
      containerRepository,
      gateRepository: new MemoryGateRepository(containerRepository),
      yardRepository: new MemoryYardRepository(containerRepository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });
    const session = await new AuthService(authRepository, authConfig).login(
      adminUser.email,
      "FictionalDemoPassword#1"
    );

    const deactivate = await request(app)
      .patch(`/api/v1/users/${managedAdmin.id}`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ isActive: false })
      .expect(409);

    expect(deactivate.body.error.code).toBe("SELF_ADMIN_LOCKOUT");

    await request(app)
      .patch(`/api/v1/users/${managedAdmin.id}`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ role: "GATE_OPERATOR" })
      .expect(409);
  });

  it("rejects weak passwords and empty updates", async () => {
    const authRepository = new MemoryAuthRepository([adminUser]);
    const containerRepository = new MemoryContainerRepository();
    const app = createApp({
      authConfig,
      authRepository,
      userRepository: new MemoryUserRepository([managedAdmin]),
      containerRepository,
      gateRepository: new MemoryGateRepository(containerRepository),
      yardRepository: new MemoryYardRepository(containerRepository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });
    const session = await new AuthService(authRepository, authConfig).login(
      adminUser.email,
      "FictionalDemoPassword#1"
    );

    await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        name: "Weak User",
        email: "weak@portflow.test",
        password: "short",
        role: "GATE_OPERATOR"
      })
      .expect(400);

    await request(app)
      .patch(`/api/v1/users/${managedAdmin.id}`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({})
      .expect(400);
  });
});
