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
import type { TestYardLocation } from "./memory-yard-repository.ts";

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
let yardUser: CredentialUser;
let gateUser: CredentialUser;
let adminToken: string;
let yardToken: string;
let gateToken: string;

function container(
  id: string,
  status: ContainerView["status"] = "IN_YARD",
  currentYard: ContainerView["currentYard"] =
    status === "STORED" ? { id: "yard-a-01", code: "A-01" } : null
): ContainerView {
  const now = new Date();

  return {
    id,
    containerNumber: "CSQU3054383",
    size: "FORTY_FT",
    type: "DRY",
    tradeType: "IMPORT",
    status,
    currentYard,
    createdAt: now,
    updatedAt: now
  };
}

function createAppWithRepos(
  containerRepository: MemoryContainerRepository,
  yardRepository: MemoryYardRepository
) {
  const authRepository = new MemoryAuthRepository([adminUser, yardUser, gateUser]);

  return createApp({
    authConfig,
    authRepository,
    userRepository: new MemoryUserRepository(),
    containerRepository,
    gateRepository: new MemoryGateRepository(containerRepository),
    yardRepository,
    dashboardRepository: emptyDashboardRepository,
    auditRepository: emptyAuditRepository
  });
}

beforeAll(async () => {
  const passwordHash = await hashPassword("FictionalDemoPassword#1");
  adminUser = {
    id: "yard-admin",
    name: "Demo Administrator",
    email: "admin@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "ADMIN" }
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

  const authRepository = new MemoryAuthRepository([adminUser, yardUser, gateUser]);
  const service = new AuthService(authRepository, authConfig);
  adminToken = (await service.login(adminUser.email, "FictionalDemoPassword#1")).accessToken;
  yardToken = (await service.login(yardUser.email, "FictionalDemoPassword#1")).accessToken;
  gateToken = (await service.login(gateUser.email, "FictionalDemoPassword#1")).accessToken;
});

describe("POST /api/v1/yard/placement", () => {
  it("allows yard operators and administrators but denies other roles", async () => {
    const containers = new MemoryContainerRepository([container("role-container")]);
    const yardRepository = new MemoryYardRepository(containers);
    const app = createAppWithRepos(containers, yardRepository);
    const input = { containerId: "role-container", yardCode: "a-01" };

    await request(app).post("/api/v1/yard/placement").send(input).expect(401);
    await request(app)
      .post("/api/v1/yard/placement")
      .set("Authorization", `Bearer ${gateToken}`)
      .send(input)
      .expect(403);
    await request(app)
      .post("/api/v1/yard/placement")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(input)
      .expect(201);
  });

  it("moves an IN_YARD container to STORED and records movement and audit", async () => {
    const containers = new MemoryContainerRepository([container("valid-container")]);
    const yardRepository = new MemoryYardRepository(containers);
    const app = createAppWithRepos(containers, yardRepository);
    const response = await request(app)
      .post("/api/v1/yard/placement")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "valid-container", yardCode: " a-01 " })
      .expect(201);

    expect(response.body.container).toMatchObject({
      id: "valid-container",
      containerNumber: "CSQU3054383",
      previousStatus: "IN_YARD",
      status: "STORED",
      yard: { id: "yard-a-01", code: "A-01" }
    });
    expect(containers.containers[0]).toMatchObject({
      status: "STORED",
      currentYard: { id: "yard-a-01", code: "A-01" }
    });
    expect(yardRepository.movements).toEqual([
      {
        containerId: "valid-container",
        actorId: yardUser.id,
        previousStatus: "IN_YARD",
        nextStatus: "STORED",
        toYardId: "yard-a-01",
        toYardCode: "A-01"
      }
    ]);
    expect(yardRepository.auditEntries).toEqual([
      {
        action: "CONTAINER_PLACED",
        entityId: "valid-container",
        actorId: yardUser.id
      }
    ]);
  });

  it.each(["REGISTERED", "STORED", "GATE_OUT", "COMPLETED"] as const)(
    "rejects a container already in %s state",
    async (status) => {
      const currentYard = status === "STORED" ? { id: "yard-a-01", code: "A-01" } : null;
      const containers = new MemoryContainerRepository([
        container(`state-${status}`, status, currentYard)
      ]);
      const yardRepository = new MemoryYardRepository(containers);
      const app = createAppWithRepos(containers, yardRepository);
      const response = await request(app)
        .post("/api/v1/yard/placement")
        .set("Authorization", `Bearer ${yardToken}`)
        .send({ containerId: `state-${status}`, yardCode: "A-01" })
        .expect(409);

      expect(response.body.error.code).toBe("INVALID_CONTAINER_STATE");
      expect(yardRepository.movements).toHaveLength(0);
      expect(yardRepository.auditEntries).toHaveLength(0);
    }
  );

  it("rejects full, inactive, or unknown yard locations", async () => {
    const alreadyPlaced = container("already-placed", "STORED", {
      id: "yard-a-01",
      code: "A-01"
    });
    const containers = new MemoryContainerRepository([
      container("capacity-container"),
      alreadyPlaced
    ]);
    const yards: TestYardLocation[] = [
      { id: "yard-a-01", code: "A-01", capacity: 1, isActive: true },
      { id: "yard-inactive", code: "C-01", capacity: 10, isActive: false }
    ];
    const yardRepository = new MemoryYardRepository(containers, yards);
    const app = createAppWithRepos(containers, yardRepository);

    const full = await request(app)
      .post("/api/v1/yard/placement")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "capacity-container", yardCode: "A-01" })
      .expect(409);
    expect(full.body.error.code).toBe("YARD_CAPACITY_FULL");

    const inactive = await request(app)
      .post("/api/v1/yard/placement")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "capacity-container", yardCode: "C-01" })
      .expect(409);
    expect(inactive.body.error.code).toBe("YARD_UNAVAILABLE");

    const missing = await request(app)
      .post("/api/v1/yard/placement")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "capacity-container", yardCode: "Z-99" })
      .expect(404);
    expect(missing.body.error.code).toBe("YARD_NOT_FOUND");
    expect(containers.containers[0]?.status).toBe("IN_YARD");
  });

  it("prevents concurrent placements from exceeding yard capacity", async () => {
    const containers = new MemoryContainerRepository([
      container("concurrent-1"),
      container("concurrent-2")
    ]);
    const yardRepository = new MemoryYardRepository(containers, [
      { id: "yard-single-slot", code: "A-01", capacity: 1, isActive: true }
    ]);
    const app = createAppWithRepos(containers, yardRepository);
    const submit = (containerId: string) =>
      request(app)
        .post("/api/v1/yard/placement")
        .set("Authorization", `Bearer ${yardToken}`)
        .send({ containerId, yardCode: "A-01" });

    const responses = await Promise.all([submit("concurrent-1"), submit("concurrent-2")]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error.code)
      .toBe("YARD_CAPACITY_FULL");
    expect(
      containers.containers.filter((candidate) => candidate.currentYard?.id === "yard-single-slot")
    ).toHaveLength(1);
    expect(yardRepository.movements).toHaveLength(1);
    expect(yardRepository.auditEntries).toHaveLength(1);
  });

  it("does not partially place a container when a transactional write fails", async () => {
    const containers = new MemoryContainerRepository([container("rollback-container")]);
    const yardRepository = new MemoryYardRepository(containers);
    yardRepository.failBeforeCommit = true;
    const app = createAppWithRepos(containers, yardRepository);
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await request(app)
        .post("/api/v1/yard/placement")
        .set("Authorization", `Bearer ${yardToken}`)
        .send({ containerId: "rollback-container", yardCode: "A-01" })
        .expect(500);
    } finally {
      logError.mockRestore();
    }

    expect(containers.containers[0]).toMatchObject({
      status: "IN_YARD",
      currentYard: null
    });
    expect(yardRepository.movements).toHaveLength(0);
    expect(yardRepository.auditEntries).toHaveLength(0);
  });

  it("validates request fields and reports missing containers", async () => {
    const containers = new MemoryContainerRepository();
    const app = createAppWithRepos(containers, new MemoryYardRepository(containers));

    await request(app)
      .post("/api/v1/yard/placement")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "", yardCode: "" })
      .expect(400);

    const missing = await request(app)
      .post("/api/v1/yard/placement")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "missing-container", yardCode: "A-01" })
      .expect(404);
    expect(missing.body.error.code).toBe("CONTAINER_NOT_FOUND");
  });
});

describe("POST /api/v1/yard/relocation", () => {
  it("allows only yard operators and administrators to relocate containers", async () => {
    const containers = new MemoryContainerRepository([
      container("role-relocation", "STORED")
    ]);
    const yardRepository = new MemoryYardRepository(containers);
    const app = createAppWithRepos(containers, yardRepository);
    const input = { containerId: "role-relocation", yardCode: "B-01" };

    await request(app).post("/api/v1/yard/relocation").send(input).expect(401);
    await request(app)
      .post("/api/v1/yard/relocation")
      .set("Authorization", `Bearer ${gateToken}`)
      .send(input)
      .expect(403);
    await request(app)
      .post("/api/v1/yard/relocation")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(input)
      .expect(201);
  });

  it("relocates a STORED container and preserves its status and location history", async () => {
    const containers = new MemoryContainerRepository([
      container("relocate-container", "STORED")
    ]);
    const yardRepository = new MemoryYardRepository(containers);
    const app = createAppWithRepos(containers, yardRepository);
    const response = await request(app)
      .post("/api/v1/yard/relocation")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "relocate-container", yardCode: " b-01 " })
      .expect(201);

    expect(response.body.container).toMatchObject({
      id: "relocate-container",
      previousStatus: "STORED",
      status: "STORED",
      yard: { id: "yard-b-01", code: "B-01" }
    });
    expect(containers.containers[0]).toMatchObject({
      status: "STORED",
      currentYard: { id: "yard-b-01", code: "B-01" }
    });
    expect(yardRepository.movements).toEqual([
      {
        containerId: "relocate-container",
        actorId: yardUser.id,
        previousStatus: "STORED",
        nextStatus: "STORED",
        fromYardId: "yard-a-01",
        fromYardCode: "A-01",
        toYardId: "yard-b-01",
        toYardCode: "B-01"
      }
    ]);
    expect(yardRepository.auditEntries).toEqual([
      {
        action: "CONTAINER_RELOCATED",
        entityId: "relocate-container",
        actorId: yardUser.id
      }
    ]);
  });

  it.each(["REGISTERED", "IN_YARD", "GATE_OUT", "COMPLETED"] as const)(
    "rejects relocation when container status is %s",
    async (status) => {
      const containers = new MemoryContainerRepository([container(`relocate-${status}`, status)]);
      const yardRepository = new MemoryYardRepository(containers);
      const app = createAppWithRepos(containers, yardRepository);
      const response = await request(app)
        .post("/api/v1/yard/relocation")
        .set("Authorization", `Bearer ${yardToken}`)
        .send({ containerId: `relocate-${status}`, yardCode: "B-01" })
        .expect(409);

      expect(response.body.error.code).toBe("INVALID_CONTAINER_STATE");
      expect(yardRepository.movements).toHaveLength(0);
    }
  );

  it("rejects relocation to the same, full, inactive, or unknown yard", async () => {
    const fullContainer = container("full-target", "STORED", {
      id: "yard-b-01",
      code: "B-01"
    });
    const relocating = container("relocating", "STORED");
    const containers = new MemoryContainerRepository([relocating, fullContainer]);
    const yards: TestYardLocation[] = [
      { id: "yard-a-01", code: "A-01", capacity: 10, isActive: true },
      { id: "yard-b-01", code: "B-01", capacity: 1, isActive: true },
      { id: "yard-inactive", code: "C-01", capacity: 10, isActive: false }
    ];
    const yardRepository = new MemoryYardRepository(containers, yards);
    const app = createAppWithRepos(containers, yardRepository);

    const sameYard = await request(app)
      .post("/api/v1/yard/relocation")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "relocating", yardCode: "A-01" })
      .expect(409);
    expect(sameYard.body.error.code).toBe("SAME_YARD_LOCATION");

    const full = await request(app)
      .post("/api/v1/yard/relocation")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "relocating", yardCode: "B-01" })
      .expect(409);
    expect(full.body.error.code).toBe("YARD_CAPACITY_FULL");

    const inactive = await request(app)
      .post("/api/v1/yard/relocation")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "relocating", yardCode: "C-01" })
      .expect(409);
    expect(inactive.body.error.code).toBe("YARD_UNAVAILABLE");

    const missing = await request(app)
      .post("/api/v1/yard/relocation")
      .set("Authorization", `Bearer ${yardToken}`)
      .send({ containerId: "relocating", yardCode: "Z-99" })
      .expect(404);
    expect(missing.body.error.code).toBe("YARD_NOT_FOUND");
    expect(relocating.currentYard?.code).toBe("A-01");
  });

  it("does not partially relocate a container when a transactional write fails", async () => {
    const containerBefore = container("relocation-rollback", "STORED");
    const containers = new MemoryContainerRepository([containerBefore]);
    const yardRepository = new MemoryYardRepository(containers);
    yardRepository.failBeforeCommit = true;
    const app = createAppWithRepos(containers, yardRepository);
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await request(app)
        .post("/api/v1/yard/relocation")
        .set("Authorization", `Bearer ${yardToken}`)
        .send({ containerId: "relocation-rollback", yardCode: "B-01" })
        .expect(500);
    } finally {
      logError.mockRestore();
    }

    expect(containerBefore).toMatchObject({
      status: "STORED",
      currentYard: { id: "yard-a-01", code: "A-01" }
    });
    expect(yardRepository.movements).toHaveLength(0);
    expect(yardRepository.auditEntries).toHaveLength(0);
  });
});

describe("yard administration", () => {
  it("allows only administrators to view yard occupancy", async () => {
    const stored = [
      container("yard-admin-1", "STORED"),
      container("yard-admin-2", "STORED")
    ];
    const containers = new MemoryContainerRepository(stored);
    const yardRepository = new MemoryYardRepository(containers);
    const app = createAppWithRepos(containers, yardRepository);

    await request(app).get("/api/v1/yard").expect(401);
    await request(app)
      .get("/api/v1/yard")
      .set("Authorization", `Bearer ${yardToken}`)
      .expect(403);

    const response = await request(app)
      .get("/api/v1/yard")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data).toEqual([
      {
        id: "yard-a-01",
        code: "A-01",
        zone: "A",
        capacity: 100,
        occupied: 2,
        isActive: true
      },
      {
        id: "yard-b-01",
        code: "B-01",
        zone: "B",
        capacity: 100,
        occupied: 0,
        isActive: true
      }
    ]);
  });

  it("exports occupancy for every yard and restricts the export to administrators", async () => {
    const stored = [
      container("yard-export-1", "STORED"),
      container("yard-export-2", "STORED")
    ];
    const containers = new MemoryContainerRepository(stored);
    const yardRepository = new MemoryYardRepository(containers);
    const app = createAppWithRepos(containers, yardRepository);

    await request(app).get("/api/v1/yard/export").expect(401);
    await request(app)
      .get("/api/v1/yard/export")
      .set("Authorization", `Bearer ${yardToken}`)
      .expect(403);

    const response = await request(app)
      .get("/api/v1/yard/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const rows = response.text.split("\r\n").filter(Boolean);

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("portflow-yard-occupancy.csv");
    expect(rows).toEqual([
      '"zone","yardCode","capacity","occupied","available","isActive","utilizationPercent"',
      '"A","A-01","100","2","98","true","2.00"',
      '"B","B-01","100","0","100","true","0.00"'
    ]);
  });

  it("prevents capacity reductions below occupancy and deactivation of occupied yards", async () => {
    const containers = new MemoryContainerRepository([
      container("yard-capacity-1", "STORED"),
      container("yard-capacity-2", "STORED")
    ]);
    const yardRepository = new MemoryYardRepository(containers);
    const app = createAppWithRepos(containers, yardRepository);
    const headers = { Authorization: `Bearer ${adminToken}` };

    const belowOccupancy = await request(app)
      .patch("/api/v1/yard/yard-a-01")
      .set(headers)
      .send({ capacity: 1 })
      .expect(409);
    expect(belowOccupancy.body.error.code).toBe("YARD_CAPACITY_BELOW_OCCUPANCY");

    const deactivateOccupied = await request(app)
      .patch("/api/v1/yard/yard-a-01")
      .set(headers)
      .send({ isActive: false })
      .expect(409);
    expect(deactivateOccupied.body.error.code).toBe("YARD_HAS_CONTAINERS");
    expect(yardRepository.auditEntries).toHaveLength(0);
  });

  it("updates capacity or deactivates an empty yard and audits changes", async () => {
    const containers = new MemoryContainerRepository();
    const yardRepository = new MemoryYardRepository(containers);
    const app = createAppWithRepos(containers, yardRepository);
    const headers = { Authorization: `Bearer ${adminToken}` };

    const updated = await request(app)
      .patch("/api/v1/yard/yard-a-01")
      .set(headers)
      .send({ capacity: 125 })
      .expect(200);
    expect(updated.body.yard).toMatchObject({
      id: "yard-a-01",
      capacity: 125,
      occupied: 0,
      isActive: true
    });

    await request(app)
      .patch("/api/v1/yard/yard-b-01")
      .set(headers)
      .send({ isActive: false })
      .expect(200);
    expect(yardRepository.yards[1]?.isActive).toBe(false);
    expect(yardRepository.auditEntries).toEqual([
      { action: "YARD_UPDATED", entityId: "yard-a-01", actorId: adminUser.id },
      { action: "YARD_UPDATED", entityId: "yard-b-01", actorId: adminUser.id }
    ]);
  });

  it("rejects empty updates, invalid capacities, and unknown yards", async () => {
    const containers = new MemoryContainerRepository();
    const app = createAppWithRepos(containers, new MemoryYardRepository(containers));
    const headers = { Authorization: `Bearer ${adminToken}` };

    await request(app)
      .patch("/api/v1/yard/yard-a-01")
      .set(headers)
      .send({})
      .expect(400);
    await request(app)
      .patch("/api/v1/yard/yard-a-01")
      .set(headers)
      .send({ capacity: 0 })
      .expect(400);

    const missing = await request(app)
      .patch("/api/v1/yard/missing-yard")
      .set(headers)
      .send({ isActive: false })
      .expect(404);
    expect(missing.body.error.code).toBe("YARD_NOT_FOUND");
  });
});
