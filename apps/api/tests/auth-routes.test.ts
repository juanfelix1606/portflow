import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { AuthConfig } from "../src/config/auth-config.ts";
import type { CredentialUser } from "../src/features/auth/auth.types.ts";
import { hashPassword } from "../src/features/auth/password.ts";
import { MemoryAuthRepository } from "./memory-auth-repository.ts";
import { MemoryUserRepository } from "./memory-user-repository.ts";
import { MemoryContainerRepository } from "./memory-container-repository.ts";
import { MemoryGateRepository } from "./memory-gate-repository.ts";
import { MemoryYardRepository } from "./memory-yard-repository.ts";
import { emptyDashboardRepository } from "./memory-dashboard-repository.ts";
import { emptyAuditRepository } from "./memory-audit-repository.ts";

const webOrigin = "http://localhost:5173";
const authConfig: AuthConfig = {
  accessTokenAudience: "portflow-web",
  accessTokenIssuer: "portflow-api",
  accessTokenSecret: new TextEncoder().encode("a-test-secret-long-enough-for-hs256"),
  accessTokenTtlSeconds: 900,
  isProduction: false,
  refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  webOrigin
};

let demoUser: CredentialUser;

beforeAll(async () => {
  demoUser = {
    id: "route-user",
    name: "Demo Administrator",
    email: "admin@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash: await hashPassword("FictionalDemoPassword#1"),
    role: { name: "ADMIN" }
  };
});

describe("authentication routes", () => {
  it("uses CSRF protection and rotates HttpOnly refresh cookies", async () => {
    const containerRepository = new MemoryContainerRepository();
    const app = createApp({
      authConfig,
      authRepository: new MemoryAuthRepository([demoUser]),
      userRepository: new MemoryUserRepository(),
      containerRepository,
      gateRepository: new MemoryGateRepository(containerRepository),
      yardRepository: new MemoryYardRepository(containerRepository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });
    const agent = request.agent(app);
    const csrfResponse = await agent
      .get("/api/v1/auth/csrf")
      .set("Origin", webOrigin)
      .expect(200);
    const initialCsrfToken: string = csrfResponse.body.csrfToken;

    await agent
      .post("/api/v1/auth/login")
      .set("Origin", webOrigin)
      .send({ email: demoUser.email, password: "FictionalDemoPassword#1" })
      .expect(403);

    const login = await agent
      .post("/api/v1/auth/login")
      .set("Origin", webOrigin)
      .set("X-CSRF-Token", initialCsrfToken)
      .send({ email: ` ${demoUser.email.toUpperCase()} `, password: "FictionalDemoPassword#1" })
      .expect(200);

    expect(login.body.user.email).toBe(demoUser.email);
    expect(login.body).not.toHaveProperty("refreshToken");
    expect(String(login.headers["set-cookie"])).toMatch(/HttpOnly/i);

    const profile = await agent
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(profile.body.user.role).toBe("ADMIN");

    const refresh = await agent
      .post("/api/v1/auth/refresh")
      .set("Origin", webOrigin)
      .set("X-CSRF-Token", login.body.csrfToken)
      .expect(200);

    expect(refresh.body.accessToken).not.toBe(login.body.accessToken);
    expect(refresh.body.csrfToken).not.toBe(login.body.csrfToken);

    await agent
      .post("/api/v1/auth/logout")
      .set("Origin", webOrigin)
      .set("X-CSRF-Token", refresh.body.csrfToken)
      .expect(204);
  });

  it("rejects requests from an unconfigured origin", async () => {
    const containerRepository = new MemoryContainerRepository();
    const app = createApp({
      authConfig,
      authRepository: new MemoryAuthRepository([demoUser]),
      userRepository: new MemoryUserRepository(),
      containerRepository,
      gateRepository: new MemoryGateRepository(containerRepository),
      yardRepository: new MemoryYardRepository(containerRepository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });

    await request(app)
      .get("/api/v1/auth/csrf")
      .set("Origin", "https://attacker.example")
      .expect(403);
  });

  it("uses Secure host-only cookies in production", async () => {
    const containerRepository = new MemoryContainerRepository();
    const productionConfig = {
      ...authConfig,
      isProduction: true,
      webOrigin: "https://portflow.test"
    };
    const app = createApp({
      authConfig: productionConfig,
      authRepository: new MemoryAuthRepository([demoUser]),
      userRepository: new MemoryUserRepository(),
      containerRepository,
      gateRepository: new MemoryGateRepository(containerRepository),
      yardRepository: new MemoryYardRepository(containerRepository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });
    const csrfResponse = await request(app)
      .get("/api/v1/auth/csrf")
      .set("Origin", productionConfig.webOrigin)
      .expect(200);
    const csrfToken: string = csrfResponse.body.csrfToken;
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", productionConfig.webOrigin)
      .set("Cookie", `__Host-portflow_csrf=${csrfToken}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ email: demoUser.email, password: "FictionalDemoPassword#1" })
      .expect(200);
    const cookies = String(login.headers["set-cookie"]);

    expect(cookies).toContain("__Host-portflow_refresh=");
    expect(cookies).toMatch(/Secure/i);
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=None/i);
  });
});
