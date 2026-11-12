import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { AuthConfig } from "../src/config/auth-config.ts";
import { AuthService } from "../src/features/auth/auth.service.ts";
import type { CredentialUser } from "../src/features/auth/auth.types.ts";
import type { DashboardRepository, DashboardSummary } from "../src/features/dashboard/dashboard.types.ts";
import type { UtcDateRange } from "../src/lib/utc-date-range.ts";
import { hashPassword } from "../src/features/auth/password.ts";
import { MemoryAuthRepository } from "./memory-auth-repository.ts";
import { MemoryContainerRepository } from "./memory-container-repository.ts";
import { MemoryGateRepository } from "./memory-gate-repository.ts";
import { MemoryUserRepository } from "./memory-user-repository.ts";
import { MemoryYardRepository } from "./memory-yard-repository.ts";
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

const summary: DashboardSummary = {
  generatedAt: new Date("2026-02-10T12:00:00Z"),
  containerCounts: {
    total: 4,
    byStatus: {
      REGISTERED: 1,
      IN_YARD: 1,
      STORED: 1,
      GATE_OUT: 1,
      COMPLETED: 0
    }
  },
  yardCapacity: {
    activeYards: 1,
    capacity: 10,
    occupied: 1,
    available: 9,
    utilizationPercent: 10,
    locations: [
      { id: "yard-a-01", code: "A-01", zone: "A", occupied: 1, capacity: 10 }
    ]
  },
  gateActivity: {
    byDirection: { IN: 2, OUT: 1 },
    byDay: [
      { date: "2026-02-10", byDirection: { IN: 2, OUT: 1 } }
    ]
  },
  recentMovements: []
};

class MemoryDashboardRepository implements DashboardRepository {
  readonly dateRanges: UtcDateRange[] = [];

  async getSummary(dateRange: UtcDateRange): Promise<DashboardSummary> {
    this.dateRanges.push(dateRange);
    return summary;
  }
}

let adminUser: CredentialUser;
let adminToken: string;

beforeAll(async () => {
  const passwordHash = await hashPassword("FictionalDemoPassword#1");
  adminUser = {
    id: "dashboard-admin",
    name: "Demo Administrator",
    email: "admin@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "ADMIN" }
  };
  const authRepository = new MemoryAuthRepository([adminUser]);
  const authService = new AuthService(authRepository, authConfig);
  adminToken = (await authService.login(adminUser.email, "FictionalDemoPassword#1")).accessToken;
});

function createDashboardApp(
  dashboardRepository: DashboardRepository = new MemoryDashboardRepository()
) {
  const containerRepository = new MemoryContainerRepository();

  return createApp({
    authConfig,
    authRepository: new MemoryAuthRepository([adminUser]),
    userRepository: new MemoryUserRepository(),
    containerRepository,
    gateRepository: new MemoryGateRepository(containerRepository),
    yardRepository: new MemoryYardRepository(containerRepository),
    dashboardRepository,
    auditRepository: emptyAuditRepository
  });
}

describe("GET /api/v1/dashboard/summary", () => {
  it("requires authentication", async () => {
    await request(createDashboardApp()).get("/api/v1/dashboard/summary").expect(401);
  });

  it("returns operational counts and disables caching", async () => {
    const dashboardRepository = new MemoryDashboardRepository();
    const response = await request(createDashboardApp(dashboardRepository))
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.summary).toMatchObject({
      containerCounts: summary.containerCounts,
      yardCapacity: summary.yardCapacity,
      gateActivity: summary.gateActivity,
      recentMovements: []
    });
    expect(dashboardRepository.dateRanges).toEqual([{}]);
  });

  it("passes inclusive UTC date bounds to the activity summary", async () => {
    const dashboardRepository = new MemoryDashboardRepository();

    await request(createDashboardApp(dashboardRepository))
      .get("/api/v1/dashboard/summary?from=2026-02-01&to=2026-02-03")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(dashboardRepository.dateRanges).toEqual([{
      occurredAtGte: new Date("2026-02-01T00:00:00.000Z"),
      occurredAtLt: new Date("2026-02-04T00:00:00.000Z")
    }]);
  });

  it("exports the filtered activity and current snapshot as CSV", async () => {
    const dashboardRepository = new MemoryDashboardRepository();
    const response = await request(createDashboardApp(dashboardRepository))
      .get("/api/v1/dashboard/summary/export?from=2026-02-10&to=2026-02-10")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("portflow-dashboard-activity.csv");
    expect(response.text).toContain('"snapshot","containers_total","","","4","containers"');
    expect(response.text).toContain('"snapshot","yard_capacity","","A-01","10","slots"');
    expect(response.text).toContain(
      '"activity","gate_transactions_by_day","2026-02-10","IN","2","transactions"'
    );
    expect(response.text).toContain(
      '"activity","gate_transactions_by_day","2026-02-10","OUT","1","transactions"'
    );
    expect(dashboardRepository.dateRanges).toEqual([{
      occurredAtGte: new Date("2026-02-10T00:00:00.000Z"),
      occurredAtLt: new Date("2026-02-11T00:00:00.000Z")
    }]);
  });

  it.each([
    "/api/v1/dashboard/summary?from=2026-02-30",
    "/api/v1/dashboard/summary?from=2026-02-03&to=2026-02-01"
  ])("rejects an invalid date range: %s", async (path) => {
    const dashboardRepository = new MemoryDashboardRepository();

    await request(createDashboardApp(dashboardRepository))
      .get(path)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);

    expect(dashboardRepository.dateRanges).toHaveLength(0);
  });
});
