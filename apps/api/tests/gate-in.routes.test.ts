import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import type { AuthConfig } from "../src/config/auth-config.ts";
import { AuthService } from "../src/features/auth/auth.service.ts";
import type { CredentialUser } from "../src/features/auth/auth.types.ts";
import { hashPassword } from "../src/features/auth/password.ts";
import type { ContainerView } from "../src/features/containers/container.types.ts";
import { MemoryAuthRepository } from "./memory-auth-repository.ts";
import { MemoryContainerRepository } from "./memory-container-repository.ts";
import { MemoryGateRepository } from "./memory-gate-repository.ts";
import { MemoryUserRepository } from "./memory-user-repository.ts";
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

let adminUser: CredentialUser;
let gateUser: CredentialUser;
let yardUser: CredentialUser;
let adminToken: string;
let gateToken: string;
let yardToken: string;

function container(id: string, status: ContainerView["status"] = "REGISTERED"): ContainerView {
  const now = new Date();

  return {
    id,
    containerNumber: "CSQU3054383",
    size: "FORTY_FT",
    type: "DRY",
    tradeType: "IMPORT",
    status,
    currentYard: status === "STORED" ? { id: "yard-1", code: "A-01" } : null,
    createdAt: now,
    updatedAt: now
  };
}

function createTestApp(
  repository: MemoryContainerRepository,
  gateRepository = new MemoryGateRepository(repository)
) {
  return createApp({
    authConfig,
    authRepository: new MemoryAuthRepository([adminUser, gateUser, yardUser]),
    userRepository: new MemoryUserRepository(),
    containerRepository: repository,
    gateRepository,
    yardRepository: new MemoryYardRepository(repository),
    dashboardRepository: emptyDashboardRepository,
    auditRepository: emptyAuditRepository
  });
}

beforeAll(async () => {
  const passwordHash = await hashPassword("FictionalDemoPassword#1");
  adminUser = {
    id: "gate-admin",
    name: "Demo Administrator",
    email: "admin@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "ADMIN" }
  };
  gateUser = {
    id: "gate-operator",
    name: "Demo Gate Operator",
    email: "gate@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "GATE_OPERATOR" }
  };
  yardUser = {
    id: "yard-operator",
    name: "Demo Yard Operator",
    email: "yard@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "YARD_OPERATOR" }
  };

  const authRepository = new MemoryAuthRepository([adminUser, gateUser, yardUser]);
  const service = new AuthService(authRepository, authConfig);
  adminToken = (await service.login(adminUser.email, "FictionalDemoPassword#1")).accessToken;
  gateToken = (await service.login(gateUser.email, "FictionalDemoPassword#1")).accessToken;
  yardToken = (await service.login(yardUser.email, "FictionalDemoPassword#1")).accessToken;
});

describe("POST /api/v1/gate/in", () => {
  it("allows gate operators and administrators but rejects other roles", async () => {
    const repository = new MemoryContainerRepository([container("auth-container")]);
    const app = createTestApp(repository);
    const input = {
      containerId: "auth-container",
      vehiclePlate: " ab-1234 ",
      driverName: "Fictional Demo Driver"
    };

    await request(app).post("/api/v1/gate/in").send(input).expect(401);
    await request(app)
      .post("/api/v1/gate/in")
      .set("Authorization", `Bearer ${yardToken}`)
      .send(input)
      .expect(403);
    await request(app)
      .post("/api/v1/gate/in")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(input)
      .expect(201);
  });

  describe("POST /api/v1/gate/out", () => {
    const input = {
      containerId: "gate-out-container",
      vehiclePlate: " ab-1234 ",
      driverName: "Fictional Demo Driver"
    };

    it("allows gate operators and administrators but rejects other roles", async () => {
      const repository = new MemoryContainerRepository([container(input.containerId, "STORED")]);
      const app = createTestApp(repository);

      await request(app).post("/api/v1/gate/out").send(input).expect(401);
      await request(app)
        .post("/api/v1/gate/out")
        .set("Authorization", `Bearer ${yardToken}`)
        .send(input)
        .expect(403);
      await request(app)
        .post("/api/v1/gate/out")
        .set("Authorization", `Bearer ${gateToken}`)
        .send(input)
        .expect(201);
    });

    it("atomically records gate-out, advances status, clears location, movement, and audit", async () => {
      const stored = container(input.containerId, "STORED");
      const repository = new MemoryContainerRepository([stored]);
      const gateRepository = new MemoryGateRepository(repository);
      const app = createTestApp(repository, gateRepository);
      const response = await request(app)
        .post("/api/v1/gate/out")
        .set("Authorization", `Bearer ${gateToken}`)
        .send(input)
        .expect(201);

      expect(response.body.gateTransaction).toMatchObject({
        direction: "OUT",
        vehiclePlate: "AB-1234",
        driverName: "Fictional Demo Driver",
        container: {
          id: input.containerId,
          containerNumber: "CSQU3054383",
          previousStatus: "STORED",
          status: "GATE_OUT"
        }
      });
      expect(response.body.gateTransaction.occurredAt).toBeTruthy();
      expect(stored.status).toBe("GATE_OUT");
      expect(stored.currentYard).toBeNull();
      expect(gateRepository.gateTransactions).toHaveLength(1);
      expect(gateRepository.movements).toEqual([
        {
          containerId: input.containerId,
          actorId: gateUser.id,
          previousStatus: "STORED",
          nextStatus: "GATE_OUT",
          fromYard: { id: "yard-1", code: "A-01" }
        }
      ]);
      expect(gateRepository.auditEntries).toEqual([
        { action: "GATE_OUT_RECORDED", entityId: input.containerId, actorId: gateUser.id }
      ]);
      expect(repository.movementHistory.at(-1)).toMatchObject({
        previousStatus: "STORED",
        nextStatus: "GATE_OUT",
        fromYard: { id: "yard-1", code: "A-01" },
        toYard: null
      });
    });

    describe("GET /api/v1/gate", () => {
      function createHistoryApp() {
        const repository = new MemoryContainerRepository([
          container("history-container-1"),
          container("history-container-2"),
          container("history-container-3")
        ]);
        const gateRepository = new MemoryGateRepository(repository);

        return { app: createTestApp(repository, gateRepository), gateRepository };
      }

      it("allows administrators and gate operators but denies other roles", async () => {
        const { app } = createHistoryApp();

        await request(app).get("/api/v1/gate").expect(401);
        await request(app)
          .get("/api/v1/gate")
          .set("Authorization", `Bearer ${yardToken}`)
          .expect(403);
        await request(app)
          .get("/api/v1/gate")
          .set("Authorization", `Bearer ${gateToken}`)
          .expect(200);
      });

      it("filters gate history and returns stable pagination metadata", async () => {
        const { app, gateRepository } = createHistoryApp();
        const inputs = [
          { containerId: "history-container-1", vehiclePlate: "TRUCK-1", driverName: "Demo Driver One" },
          { containerId: "history-container-2", vehiclePlate: "TRUCK-2", driverName: "Demo Driver Two" },
          { containerId: "history-container-3", vehiclePlate: "TRUCK-3", driverName: "Demo Driver Three" }
        ];

        for (const input of inputs) {
          await request(app)
            .post("/api/v1/gate/in")
            .set("Authorization", `Bearer ${gateToken}`)
            .send(input)
            .expect(201);
        }

        const firstPage = await request(app)
          .get("/api/v1/gate?page=1&limit=2")
          .set("Authorization", `Bearer ${gateToken}`)
          .expect(200);
        expect(firstPage.body.data).toHaveLength(2);
        expect(firstPage.body.pagination).toMatchObject({
          page: 1,
          limit: 2,
          total: 3,
          totalPages: 2
        });

        const searched = await request(app)
          .get("/api/v1/gate?search=truck-2&direction=IN")
          .set("Authorization", `Bearer ${gateToken}`)
          .expect(200);
        expect(searched.body.data).toHaveLength(1);
        expect(searched.body.data[0]).toMatchObject({
          direction: "IN",
          vehiclePlate: "TRUCK-2",
          driverName: "Demo Driver Two",
          container: { id: "history-container-2" },
          operator: { id: gateUser.id }
        });
        expect(gateRepository.history).toHaveLength(3);
      });

      it("uses inclusive UTC calendar dates in history and exports", async () => {
        const { app, gateRepository } = createHistoryApp();
        const timestamps = [
          "2026-01-31T23:59:59.999Z",
          "2026-02-01T00:00:00.000Z",
          "2026-02-01T23:59:59.999Z",
          "2026-02-02T00:00:00.000Z"
        ];
        for (const [index, occurredAt] of timestamps.entries()) {
          gateRepository.history.push({
            id: `gate-date-${index}`,
            direction: "IN",
            vehiclePlate: `DATE-${index}`,
            driverName: "Fictional Date Driver",
            occurredAt: new Date(occurredAt),
            container: { id: `date-container-${index}`, containerNumber: "CSQU3054383" },
            operator: { id: gateUser.id, name: "Demo Gate Operator" }
          });
        }

        const listing = await request(app)
          .get("/api/v1/gate?from=2026-02-01&to=2026-02-01")
          .set("Authorization", `Bearer ${gateToken}`)
          .expect(200);
        expect(listing.body.data.map((entry: { id: string }) => entry.id).sort()).toEqual([
          "gate-date-1",
          "gate-date-2"
        ]);

        const exported = await request(app)
          .get("/api/v1/gate/export?from=2026-02-01&to=2026-02-01")
          .set("Authorization", `Bearer ${gateToken}`)
          .expect(200);
        expect(exported.text.split("\r\n").filter(Boolean)).toHaveLength(3);

        await request(app)
          .get("/api/v1/gate?from=2026-02-02&to=2026-02-01")
          .set("Authorization", `Bearer ${gateToken}`)
          .expect(400);
      });

      it("validates pagination and direction query parameters", async () => {
        const { app } = createHistoryApp();

        await request(app)
          .get("/api/v1/gate?page=0")
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(400);
        await request(app)
          .get("/api/v1/gate?direction=SIDEWAYS")
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(400);
        await request(app)
          .get("/api/v1/gate?limit=101")
          .set("Authorization", `Bearer ${adminToken}`)
          .expect(400);
      });

      it("exports every matching gate transaction as a safe CSV", async () => {
        const { app, gateRepository } = createHistoryApp();
        const occurredAt = new Date("2026-02-01T10:00:00.000Z");
        for (let index = 0; index < 501; index += 1) {
          gateRepository.history.push({
            id: `gate-export-${index}`,
            direction: "IN",
            vehiclePlate: index === 0 ? "=SUM(1,1)" : `DEMO-${index}`,
            driverName: "Fictional Bulk Driver",
            occurredAt,
            container: {
              id: `container-${index}`,
              containerNumber: `CSQU${String(index).padStart(7, "0")}`
            },
            operator: { id: gateUser.id, name: "Demo Gate Operator" }
          });
        }

        const response = await request(app)
          .get("/api/v1/gate/export?search=fictional&direction=IN&from=2026-02-01&to=2026-02-01")
          .set("Authorization", `Bearer ${gateToken}`)
          .expect(200);
        const rows = response.text.split("\r\n").filter(Boolean);

        expect(response.headers["content-type"]).toContain("text/csv");
        expect(response.headers["content-disposition"]).toContain("portflow-gate-history.csv");
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(rows).toHaveLength(502);
        expect(response.text).toContain("\"'=SUM(1,1)\"");
      });
    });

    it("rejects duplicate gate-out requests without adding duplicate records", async () => {
      const repository = new MemoryContainerRepository([container(input.containerId, "STORED")]);
      const gateRepository = new MemoryGateRepository(repository);
      const app = createTestApp(repository, gateRepository);
      const submit = () =>
        request(app)
          .post("/api/v1/gate/out")
          .set("Authorization", `Bearer ${gateToken}`)
          .send(input);

      const responses = await Promise.all([submit(), submit()]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(responses.find((response) => response.status === 409)?.body.error.code)
        .toBe("DUPLICATE_GATE_OUT");
      expect(gateRepository.gateTransactions).toHaveLength(1);
      expect(gateRepository.movements).toHaveLength(1);
      expect(gateRepository.auditEntries).toHaveLength(1);
    });

    it.each(["REGISTERED", "IN_YARD", "GATE_OUT", "COMPLETED"] as const)(
      "rejects gate-out when the container is %s",
      async (status) => {
        const repository = new MemoryContainerRepository([container(`out-${status}`, status)]);
        const gateRepository = new MemoryGateRepository(repository);
        const app = createTestApp(repository, gateRepository);
        const response = await request(app)
          .post("/api/v1/gate/out")
          .set("Authorization", `Bearer ${gateToken}`)
          .send({ ...input, containerId: `out-${status}` })
          .expect(409);

        expect(response.body.error.code).toBe("INVALID_CONTAINER_STATE");
        expect(gateRepository.gateTransactions).toHaveLength(0);
        expect(gateRepository.movements).toHaveLength(0);
        expect(gateRepository.auditEntries).toHaveLength(0);
      }
    );

    it("rejects a stored container without a yard location", async () => {
      const stored = container(input.containerId, "STORED");
      stored.currentYard = null;
      const repository = new MemoryContainerRepository([stored]);
      const gateRepository = new MemoryGateRepository(repository);
      const app = createTestApp(repository, gateRepository);
      const response = await request(app)
        .post("/api/v1/gate/out")
        .set("Authorization", `Bearer ${gateToken}`)
        .send(input)
        .expect(409);

      expect(response.body.error.code).toBe("INVALID_CONTAINER_STATE");
      expect(gateRepository.gateTransactions).toHaveLength(0);
    });

    it("rejects nonexistent containers and invalid gate input", async () => {
      const repository = new MemoryContainerRepository();
      const app = createTestApp(repository);

      const missing = await request(app)
        .post("/api/v1/gate/out")
        .set("Authorization", `Bearer ${gateToken}`)
        .send(input)
        .expect(404);
      expect(missing.body.error.code).toBe("CONTAINER_NOT_FOUND");

      await request(app)
        .post("/api/v1/gate/out")
        .set("Authorization", `Bearer ${gateToken}`)
        .send({ ...input, vehiclePlate: " " })
        .expect(400);
    });

    it("leaves all records unchanged if a transactional write fails", async () => {
      const stored = container(input.containerId, "STORED");
      const repository = new MemoryContainerRepository([stored]);
      const gateRepository = new MemoryGateRepository(repository);
      gateRepository.failBeforeCommit = true;
      const app = createTestApp(repository, gateRepository);
      const logError = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        await request(app)
          .post("/api/v1/gate/out")
          .set("Authorization", `Bearer ${gateToken}`)
          .send(input)
          .expect(500);
      } finally {
        logError.mockRestore();
      }

      expect(stored.status).toBe("STORED");
      expect(stored.currentYard).toEqual({ id: "yard-1", code: "A-01" });
      expect(gateRepository.gateTransactions).toHaveLength(0);
      expect(gateRepository.movements).toHaveLength(0);
      expect(gateRepository.auditEntries).toHaveLength(0);
    });
  });

  it("atomically records gate-in, advances status, movement, and audit", async () => {
    const repository = new MemoryContainerRepository([container("valid-container")]);
    const gateRepository = new MemoryGateRepository(repository);
    const app = createApp({
      authConfig,
      authRepository: new MemoryAuthRepository([adminUser, gateUser, yardUser]),
      userRepository: new MemoryUserRepository(),
      containerRepository: repository,
      gateRepository,
      yardRepository: new MemoryYardRepository(repository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });
    const response = await request(app)
      .post("/api/v1/gate/in")
      .set("Authorization", `Bearer ${gateToken}`)
      .send({
        containerId: "valid-container",
        vehiclePlate: " ab-1234 ",
        driverName: "Fictional Demo Driver"
      })
      .expect(201);

    expect(response.body.gateTransaction).toMatchObject({
      direction: "IN",
      vehiclePlate: "AB-1234",
      driverName: "Fictional Demo Driver",
      container: {
        id: "valid-container",
        containerNumber: "CSQU3054383",
        previousStatus: "REGISTERED",
        status: "IN_YARD"
      }
    });
    expect(response.body.gateTransaction.occurredAt).toBeTruthy();
    expect(repository.containers[0]?.status).toBe("IN_YARD");
    expect(gateRepository.gateTransactions).toHaveLength(1);
    expect(gateRepository.movements).toEqual([
      {
        containerId: "valid-container",
        actorId: gateUser.id,
        previousStatus: "REGISTERED",
        nextStatus: "IN_YARD"
      }
    ]);
    expect(gateRepository.auditEntries).toEqual([
      {
        action: "GATE_IN_RECORDED",
        entityId: "valid-container",
        actorId: gateUser.id
      }
    ]);
  });

  it("rejects duplicate gate-in requests without adding duplicate records", async () => {
    const repository = new MemoryContainerRepository([container("duplicate-container")]);
    const gateRepository = new MemoryGateRepository(repository);
    const app = createApp({
      authConfig,
      authRepository: new MemoryAuthRepository([adminUser, gateUser, yardUser]),
      userRepository: new MemoryUserRepository(),
      containerRepository: repository,
      gateRepository,
      yardRepository: new MemoryYardRepository(repository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });
    const submit = () =>
      request(app)
        .post("/api/v1/gate/in")
        .set("Authorization", `Bearer ${gateToken}`)
        .send({
          containerId: "duplicate-container",
          vehiclePlate: "AB-1234",
          driverName: "Fictional Demo Driver"
        });

    const responses = await Promise.all([submit(), submit()]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error.code)
      .toBe("DUPLICATE_GATE_IN");
    expect(gateRepository.gateTransactions).toHaveLength(1);
    expect(gateRepository.movements).toHaveLength(1);
    expect(gateRepository.auditEntries).toHaveLength(1);
  });

  it.each(["IN_YARD", "STORED", "GATE_OUT", "COMPLETED"] as const)(
    "rejects gate-in when the container is already %s",
    async (status) => {
      const repository = new MemoryContainerRepository([container(`status-${status}`, status)]);
      const gateRepository = new MemoryGateRepository(repository);
      const app = createTestApp(repository);
      const response = await request(app)
        .post("/api/v1/gate/in")
        .set("Authorization", `Bearer ${gateToken}`)
        .send({
          containerId: `status-${status}`,
          vehiclePlate: "AB-1234",
          driverName: "Fictional Demo Driver"
        })
        .expect(409);

      expect(response.body.error.code).toBe("INVALID_CONTAINER_STATE");
      expect(gateRepository.gateTransactions).toHaveLength(0);
      expect(gateRepository.movements).toHaveLength(0);
      expect(gateRepository.auditEntries).toHaveLength(0);
    }
  );

  it("rejects nonexistent containers and invalid gate input", async () => {
    const repository = new MemoryContainerRepository();
    const app = createTestApp(repository);

    const missing = await request(app)
      .post("/api/v1/gate/in")
      .set("Authorization", `Bearer ${gateToken}`)
      .send({
        containerId: "missing-container",
        vehiclePlate: "AB-1234",
        driverName: "Fictional Demo Driver"
      })
      .expect(404);
    expect(missing.body.error.code).toBe("CONTAINER_NOT_FOUND");

    await request(app)
      .post("/api/v1/gate/in")
      .set("Authorization", `Bearer ${gateToken}`)
      .send({
        containerId: "missing-container",
        vehiclePlate: " ",
        driverName: ""
      })
      .expect(400);
  });

  it("leaves all records unchanged if a transactional write fails", async () => {
    const initialContainer = container("rollback-container");
    const repository = new MemoryContainerRepository([initialContainer]);
    const gateRepository = new MemoryGateRepository(repository);
    gateRepository.failBeforeCommit = true;
    const app = createApp({
      authConfig,
      authRepository: new MemoryAuthRepository([adminUser, gateUser, yardUser]),
      userRepository: new MemoryUserRepository(),
      containerRepository: repository,
      gateRepository,
      yardRepository: new MemoryYardRepository(repository),
      dashboardRepository: emptyDashboardRepository,
      auditRepository: emptyAuditRepository
    });
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await request(app)
        .post("/api/v1/gate/in")
        .set("Authorization", `Bearer ${gateToken}`)
        .send({
          containerId: "rollback-container",
          vehiclePlate: "AB-1234",
          driverName: "Fictional Demo Driver"
        })
        .expect(500);
    } finally {
      logError.mockRestore();
    }

    expect(repository.containers[0]?.status).toBe("REGISTERED");
    expect(gateRepository.gateTransactions).toHaveLength(0);
    expect(gateRepository.movements).toHaveLength(0);
    expect(gateRepository.auditEntries).toHaveLength(0);
  });
});
