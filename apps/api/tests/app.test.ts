import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.ts";
import type { AuthConfig } from "../src/config/auth-config.ts";
import type { AuthRepository } from "../src/features/auth/auth.types.ts";
import { MemoryUserRepository } from "./memory-user-repository.ts";
import { MemoryContainerRepository } from "./memory-container-repository.ts";
import { MemoryGateRepository } from "./memory-gate-repository.ts";
import { MemoryYardRepository } from "./memory-yard-repository.ts";
import { emptyDashboardRepository } from "./memory-dashboard-repository.ts";
import { emptyAuditRepository } from "./memory-audit-repository.ts";

const authConfig: AuthConfig = {
  accessTokenAudience: "portflow-web",
  accessTokenIssuer: "portflow-api",
  accessTokenSecret: new TextEncoder().encode("a-test-secret-long-enough-for-hs256"),
  accessTokenTtlSeconds: 900,
  isProduction: false,
  refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  webOrigin: "http://localhost:5173"
};

const repository: AuthRepository = {
  findUserByEmail: async () => null,
  findUserById: async () => null,
  findSessionByTokenHash: async () => null,
  createSession: async () => true,
  rotateSession: async () => false,
  revokeSessionByTokenHash: async () => {}
};

const containerRepository = new MemoryContainerRepository();
const app = createApp({
  authConfig,
  authRepository: repository,
  userRepository: new MemoryUserRepository(),
  containerRepository,
  gateRepository: new MemoryGateRepository(containerRepository),
  yardRepository: new MemoryYardRepository(containerRepository),
  dashboardRepository: emptyDashboardRepository,
  auditRepository: emptyAuditRepository
});

describe("GET /api/v1/health", () => {
  it("returns the API health status", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("CORS", () => {
  it("allows preflight requests for admin user updates", async () => {
    const response = await request(app)
      .options("/api/v1/users/demo-user")
      .set("Origin", authConfig.webOrigin)
      .set("Access-Control-Request-Method", "PATCH")
      .set("Access-Control-Request-Headers", "authorization,content-type")
      .expect(204);

    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
  });
});

describe("request parsing", () => {
  it("returns a client error for malformed JSON", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });
});
