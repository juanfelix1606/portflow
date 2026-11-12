import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { AuthConfig } from "../src/config/auth-config.ts";
import { AuthService } from "../src/features/auth/auth.service.ts";
import type { CredentialUser } from "../src/features/auth/auth.types.ts";
import type { AuditLogRecord } from "../src/features/audit/audit.types.ts";
import { hashPassword } from "../src/features/auth/password.ts";
import { MemoryAuthRepository } from "./memory-auth-repository.ts";
import { MemoryAuditRepository } from "./memory-audit-repository.ts";
import { MemoryContainerRepository } from "./memory-container-repository.ts";
import { MemoryGateRepository } from "./memory-gate-repository.ts";
import { MemoryUserRepository } from "./memory-user-repository.ts";
import { MemoryYardRepository } from "./memory-yard-repository.ts";
import { emptyDashboardRepository } from "./memory-dashboard-repository.ts";

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
let yardUser: CredentialUser;
let adminToken: string;
let gateToken: string;
let yardToken: string;

const logs: AuditLogRecord[] = [
  {
    id: "audit-1",
    actorId: "audit-admin",
    actorEmail: "admin@portflow.test",
    actorName: "Demo Administrator",
    action: "USER_CREATED",
    entityType: "USER",
    entityId: "demo-user",
    oldValue: null,
    newValue: {
      name: "Demo Yard Operator",
      email: "yard@portflow.test",
      passwordHash: "fictional-password-hash",
      metadata: { refresh_token: "fictional-refresh-token" }
    },
    occurredAt: new Date("2026-02-01T10:00:00.000Z")
  },
  {
    id: "audit-2",
    actorId: "audit-gate",
    actorEmail: "gate@portflow.test",
    actorName: "Demo Gate Operator",
    action: "GATE_IN_RECORDED",
    entityType: "CONTAINER",
    entityId: "container-1",
    oldValue: { status: "REGISTERED" },
    newValue: { status: "IN_YARD", vehiclePlate: "AB-1234" },
    occurredAt: new Date("2026-02-02T10:00:00.000Z")
  },
  {
    id: "audit-3",
    actorId: "audit-admin",
    actorEmail: "admin@portflow.test",
    actorName: "Demo Administrator",
    action: "YARD_UPDATED",
    entityType: "YARD",
    entityId: "yard-a-01",
    oldValue: { capacity: 100 },
    newValue: { capacity: 120 },
    occurredAt: new Date("2026-02-03T10:00:00.000Z")
  }
];

function createAuditApp(auditRepository = new MemoryAuditRepository(logs)) {
  const containers = new MemoryContainerRepository();

  return createApp({
    authConfig,
    authRepository: new MemoryAuthRepository([adminUser, gateUser, yardUser]),
    userRepository: new MemoryUserRepository(),
    containerRepository: containers,
    gateRepository: new MemoryGateRepository(containers),
    yardRepository: new MemoryYardRepository(containers),
    dashboardRepository: emptyDashboardRepository,
    auditRepository
  });
}

beforeAll(async () => {
  const passwordHash = await hashPassword("FictionalDemoPassword#1");
  adminUser = {
    id: "audit-admin",
    name: "Demo Administrator",
    email: "admin@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "ADMIN" }
  };
  gateUser = {
    id: "audit-gate",
    name: "Demo Gate Operator",
    email: "gate@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "GATE_OPERATOR" }
  };
  yardUser = {
    id: "audit-yard",
    name: "Demo Yard Operator",
    email: "yard@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "YARD_OPERATOR" }
  };

  const auth = new AuthService(
    new MemoryAuthRepository([adminUser, gateUser, yardUser]),
    authConfig
  );
  adminToken = (await auth.login(adminUser.email, "FictionalDemoPassword#1")).accessToken;
  gateToken = (await auth.login(gateUser.email, "FictionalDemoPassword#1")).accessToken;
  yardToken = (await auth.login(yardUser.email, "FictionalDemoPassword#1")).accessToken;
});

describe("GET /api/v1/audit", () => {
  it("restricts access to administrators", async () => {
    const app = createAuditApp();

    await request(app).get("/api/v1/audit").expect(401);
    await request(app)
      .get("/api/v1/audit")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(403);
    await request(app)
      .get("/api/v1/audit")
      .set("Authorization", `Bearer ${yardToken}`)
      .expect(403);
  });

  it("filters by entity, action, and search with paginated results", async () => {
    const app = createAuditApp();

    const firstPage = await request(app)
      .get("/api/v1/audit?page=1&limit=2")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(firstPage.headers["cache-control"]).toBe("no-store");
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.data[0].id).toBe("audit-3");
    expect(firstPage.body.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2
    });

    const filtered = await request(app)
      .get("/api/v1/audit?entityType=CONTAINER&action=GATE_IN_RECORDED&search=gate%40portflow.test")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0]).toMatchObject({
      actorEmail: "gate@portflow.test",
      action: "GATE_IN_RECORDED",
      entityType: "CONTAINER",
      entityId: "container-1"
    });
  });

  it("filters audit history and exports by inclusive UTC date range", async () => {
    const app = createAuditApp();

    const listing = await request(app)
      .get("/api/v1/audit?from=2026-02-02&to=2026-02-02")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(listing.body.data.map((entry: { id: string }) => entry.id)).toEqual(["audit-2"]);

    const exported = await request(app)
      .get("/api/v1/audit/export?from=2026-02-02&to=2026-02-02")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(exported.text.split("\r\n").filter(Boolean)).toHaveLength(2);
    expect(exported.text).toContain("GATE_IN_RECORDED");

    await request(app)
      .get("/api/v1/audit?from=2026-02-03&to=2026-02-01")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });

  it("never exposes password or token values from audit JSON", async () => {
    const app = createAuditApp();
    const response = await request(app)
      .get("/api/v1/audit?action=USER_CREATED")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data[0].newValue).toEqual({
      name: "Demo Yard Operator",
      email: "yard@portflow.test",
      metadata: {}
    });
    expect(JSON.stringify(response.body)).not.toContain("fictional-password-hash");
    expect(JSON.stringify(response.body)).not.toContain("fictional-refresh-token");
  });

  it("validates pagination and filters", async () => {
    const app = createAuditApp();

    await request(app)
      .get("/api/v1/audit?page=0")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    await request(app)
      .get("/api/v1/audit?limit=101")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    await request(app)
      .get("/api/v1/audit?entityType=GATE")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });

  it("exports all matching audit entries across batches without secrets", async () => {
    const bulkLogs: AuditLogRecord[] = Array.from({ length: 501 }, (_value, index) => ({
      id: `audit-export-${index}`,
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      actorName: "Demo Bulk Administrator",
      action: "YARD_UPDATED",
      entityType: "YARD",
      entityId: index === 0 ? "=SUM(1,1)" : `yard-${index}`,
      oldValue: null,
      newValue: index === 0
        ? { capacity: index, password_hash: "fictional-secret" }
        : { capacity: index },
      occurredAt: new Date(Date.UTC(2026, 1, 1, 0, index))
    }));
    const app = createAuditApp(new MemoryAuditRepository(bulkLogs));
    const response = await request(app)
      .get("/api/v1/audit/export?search=bulk&entityType=YARD&action=YARD_UPDATED&from=2026-02-01&to=2026-02-01")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const rows = response.text.split("\r\n").filter(Boolean);

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("portflow-audit-log.csv");
    expect(rows).toHaveLength(502);
    expect(response.text).toContain("\"'=SUM(1,1)\"");
    expect(response.text).not.toContain("fictional-secret");
  });
});
