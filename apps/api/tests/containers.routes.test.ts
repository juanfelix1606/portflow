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

function container(
  id: string,
  containerNumber: string,
  createdAt: Date,
  overrides: Partial<ContainerView> = {}
): ContainerView {
  return {
    id,
    containerNumber,
    size: "FORTY_FT",
    type: "DRY",
    tradeType: "IMPORT",
    status: "REGISTERED",
    currentYard: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function createTestApp(repository: MemoryContainerRepository) {
  return createApp({
    authConfig,
    authRepository: new MemoryAuthRepository([adminUser, gateUser, yardUser]),
    userRepository: new MemoryUserRepository(),
    containerRepository: repository,
    gateRepository: new MemoryGateRepository(repository),
    yardRepository: new MemoryYardRepository(repository),
    dashboardRepository: emptyDashboardRepository,
    auditRepository: emptyAuditRepository
  });
}

beforeAll(async () => {
  const passwordHash = await hashPassword("FictionalDemoPassword#1");

  adminUser = {
    id: "container-admin",
    name: "Demo Administrator",
    email: "admin@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "ADMIN" }
  };
  gateUser = {
    id: "container-gate-operator",
    name: "Demo Gate Operator",
    email: "gate@portflow.test",
    isActive: true,
    mustChangePassword: false,
    authVersion: 0,
    passwordHash,
    role: { name: "GATE_OPERATOR" }
  };
  yardUser = {
    id: "container-yard-operator",
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

describe("container registration", () => {
  it("requires authentication and reserves registration for administrators", async () => {
    const app = createTestApp(new MemoryContainerRepository());

    await request(app).post("/api/v1/containers").expect(401);
    await request(app)
      .post("/api/v1/containers")
      .set("Authorization", `Bearer ${gateToken}`)
      .send({
        containerNumber: "CSQU3054383",
        size: "FORTY_FT",
        type: "DRY",
        tradeType: "IMPORT"
      })
      .expect(403);
  });

  it("registers normalized valid containers and records initial movement and audit", async () => {
    const repository = new MemoryContainerRepository();
    const app = createTestApp(repository);
    const response = await request(app)
      .post("/api/v1/containers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        containerNumber: " csqu3054383 ",
        size: "FORTY_FT",
        type: "REEFER",
        tradeType: "IMPORT"
      })
      .expect(201);

    expect(response.body.container).toMatchObject({
      containerNumber: "CSQU3054383",
      size: "FORTY_FT",
      type: "REEFER",
      tradeType: "IMPORT",
      status: "REGISTERED",
      currentYard: null
    });
    expect(response.body.container).not.toHaveProperty("passwordHash");
    expect(repository.movements).toEqual([
      {
        containerId: response.body.container.id,
        actorId: adminUser.id,
        previousStatus: null,
        nextStatus: "REGISTERED"
      }
    ]);
    expect(repository.auditEntries).toEqual([
      {
        action: "CONTAINER_REGISTERED",
        entityId: response.body.container.id,
        actorId: adminUser.id
      }
    ]);
  });

  it("rejects malformed or invalid check digits without storing a container", async () => {
    const repository = new MemoryContainerRepository();
    const app = createTestApp(repository);

    for (const containerNumber of ["CSQU3054384", "CSQA3054383", "CSQU30543A3"]) {
      const response = await request(app)
        .post("/api/v1/containers")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          containerNumber,
          size: "FORTY_FT",
          type: "DRY",
          tradeType: "IMPORT"
        })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    }

    expect(repository.containers).toHaveLength(0);
    expect(repository.movements).toHaveLength(0);
    expect(repository.auditEntries).toHaveLength(0);
  });

  it("rejects duplicate numbers and invalid container attributes", async () => {
    const existing = container("existing-1", "CSQU3054383", new Date("2026-01-01T00:00:00Z"));
    const repository = new MemoryContainerRepository([existing]);
    const app = createTestApp(repository);

    const duplicate = await request(app)
      .post("/api/v1/containers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        containerNumber: "CSQU3054383",
        size: "FORTY_FT",
        type: "DRY",
        tradeType: "IMPORT"
      })
      .expect(409);

    expect(duplicate.body.error.code).toBe("CONTAINER_ALREADY_EXISTS");

    await request(app)
      .post("/api/v1/containers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        containerNumber: "CSQU3054383",
        size: "TWENTY_FT",
        type: "INVALID",
        tradeType: "IMPORT"
      })
      .expect(400);
  });
});

describe("container CSV import", () => {
  it("previews validated rows without inserting them and reports database conflicts", async () => {
    const repository = new MemoryContainerRepository([
      container("existing-container", "TGHU1234567", new Date("2026-01-01T00:00:00Z"))
    ]);
    const app = createTestApp(repository);
    const csv = [
      "containerNumber,size,type,tradeType",
      "CSQU3054383,FORTY_FT,DRY,IMPORT",
      "MSCU6639870,TWENTY_FT,REEFER,EXPORT"
    ].join("\r\n");

    const preview = await request(app)
      .post("/api/v1/containers/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "text/csv")
      .send(csv)
      .expect(200);

    expect(preview.body).toEqual({
      rowCount: 2,
      sample: [
        {
          row: 2,
          containerNumber: "CSQU3054383",
          size: "FORTY_FT",
          type: "DRY",
          tradeType: "IMPORT"
        },
        {
          row: 3,
          containerNumber: "MSCU6639870",
          size: "TWENTY_FT",
          type: "REEFER",
          tradeType: "EXPORT"
        }
      ]
    });
    expect(repository.containers).toHaveLength(1);
    expect(repository.movements).toHaveLength(0);
    expect(repository.auditEntries).toHaveLength(0);

    const conflict = await request(app)
      .post("/api/v1/containers/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "text/csv")
      .send([
        "containerNumber,size,type,tradeType",
        "TGHU1234567,FORTY_FT,DRY,IMPORT",
        "MSCU6639870,TWENTY_FT,REEFER,EXPORT"
      ].join("\n"))
      .expect(409);
    expect(conflict.body.error.code).toBe("CONTAINER_IMPORT_CONFLICT");
    expect(conflict.body.error.details).toEqual([
      expect.objectContaining({ row: 2, column: "containerNumber" })
    ]);
    expect(repository.containers).toHaveLength(1);
  });

  it("imports a valid file with registration movement and audit records", async () => {
    const repository = new MemoryContainerRepository();
    const app = createTestApp(repository);
    const csv = [
      "containerNumber,size,type,tradeType",
      "CSQU3054383,FORTY_FT,DRY,IMPORT",
      "MSCU6639870,TWENTY_FT,REEFER,EXPORT"
    ].join("\r\n");

    await request(app)
      .post("/api/v1/containers/import")
      .set("Content-Type", "text/csv")
      .send(csv)
      .expect(401);

    await request(app)
      .post("/api/v1/containers/import")
      .set("Authorization", `Bearer ${gateToken}`)
      .set("Content-Type", "text/csv")
      .send(csv)
      .expect(403);

    const response = await request(app)
      .post("/api/v1/containers/import")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "text/csv")
      .send(csv)
      .expect(201);

    expect(response.body.importedCount).toBe(2);
    expect(response.body.containers.map((item: { containerNumber: string }) =>
      item.containerNumber
    )).toEqual(["CSQU3054383", "MSCU6639870"]);
    expect(repository.containers).toHaveLength(2);
    expect(repository.movements).toHaveLength(2);
    expect(repository.auditEntries).toHaveLength(2);
  });

  it("rejects invalid rows and in-file duplicates without importing any rows", async () => {
    const repository = new MemoryContainerRepository();
    const app = createTestApp(repository);
    const csv = [
      "containerNumber,size,type,tradeType",
      "CSQU3054383,FORTY_FT,DRY,IMPORT",
      "CSQU3054383,FORTY_FT,DRY,IMPORT",
      "MSCU6639871,TWENTY_FT,REEFER,EXPORT"
    ].join("\n");

    const response = await request(app)
      .post("/api/v1/containers/import")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "text/csv")
      .send(csv)
      .expect(400);

    expect(response.body.error.code).toBe("CONTAINER_IMPORT_VALIDATION_FAILED");
    expect(response.body.error.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 3, column: "containerNumber" }),
      expect.objectContaining({ row: 4, column: "containerNumber" })
    ]));
    expect(repository.containers).toHaveLength(0);
    expect(repository.movements).toHaveLength(0);
    expect(repository.auditEntries).toHaveLength(0);
  });

  it("rejects database duplicates atomically and reports the conflicting CSV row", async () => {
    const existing = container(
      "existing-container",
      "CSQU3054383",
      new Date("2026-01-01T00:00:00Z")
    );
    const repository = new MemoryContainerRepository([existing]);
    const app = createTestApp(repository);
    const csv = [
      "containerNumber,size,type,tradeType",
      "CSQU3054383,FORTY_FT,DRY,IMPORT",
      "MSCU6639870,TWENTY_FT,REEFER,EXPORT"
    ].join("\n");

    const response = await request(app)
      .post("/api/v1/containers/import")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "text/csv")
      .send(csv)
      .expect(409);

    expect(response.body.error.code).toBe("CONTAINER_IMPORT_CONFLICT");
    expect(response.body.error.details).toEqual([
      expect.objectContaining({ row: 2, column: "containerNumber" })
    ]);
    expect(repository.containers).toEqual([existing]);
    expect(repository.movements).toHaveLength(0);
    expect(repository.auditEntries).toHaveLength(0);
  });

  it("rejects malformed CSV and invalid headers", async () => {
    const app = createTestApp(new MemoryContainerRepository());

    const invalidHeader = await request(app)
      .post("/api/v1/containers/import")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "text/csv")
      .send("number,size,type,tradeType\nCSQU3054383,FORTY_FT,DRY,IMPORT")
      .expect(400);
    expect(invalidHeader.body.error.code).toBe("INVALID_CSV_HEADER");

    const malformedCsv = await request(app)
      .post("/api/v1/containers/import")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "text/csv")
      .send('containerNumber,size,type,tradeType\n"CSQU3054383,FORTY_FT,DRY,IMPORT')
      .expect(400);
    expect(malformedCsv.body.error.code).toBe("INVALID_CSV");

    const tooManyRows = await request(app)
      .post("/api/v1/containers/import")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "text/csv")
      .send([
        "containerNumber,size,type,tradeType",
        ...Array.from({ length: 501 }, () => "invalid")
      ].join("\n"))
      .expect(400);
    expect(tooManyRows.body.error.code).toBe("CSV_ROW_LIMIT_EXCEEDED");
  });
});

describe("container search, filters, and pagination", () => {
  it("filters by inclusive UTC creation dates and rejects reversed ranges", async () => {
    const before = container(
      "before-range",
      "CSQU3054383",
      new Date("2026-01-01T23:59:59.999Z")
    );
    const inRangeStart = container(
      "range-start",
      "MSCU6639870",
      new Date("2026-01-02T00:00:00.000Z")
    );
    const inRangeEnd = container(
      "range-end",
      "TGHU1234567",
      new Date("2026-01-02T23:59:59.999Z")
    );
    const after = container(
      "after-range",
      "CSQU3054383",
      new Date("2026-01-03T00:00:00.000Z")
    );
    const app = createTestApp(
      new MemoryContainerRepository([before, inRangeStart, inRangeEnd, after])
    );

    const response = await request(app)
      .get("/api/v1/containers?from=2026-01-02&to=2026-01-02")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(200);
    expect(response.body.data.map((item: ContainerView) => item.id)).toEqual([
      inRangeEnd.id,
      inRangeStart.id
    ]);

    await request(app)
      .get("/api/v1/containers?from=2026-01-03&to=2026-01-02")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(400);
    await request(app)
      .get("/api/v1/containers?from=not-a-date")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(400);
  });

  it("filters inventory by normalized current yard code", async () => {
    const assignedToA = container(
      "yard-a-container",
      "CSQU3054383",
      new Date("2026-01-01T00:00:00Z"),
      { currentYard: { id: "yard-a", code: "A-01" } }
    );
    const assignedToB = container(
      "yard-b-container",
      "MSCU6639870",
      new Date("2026-01-02T00:00:00Z"),
      { currentYard: { id: "yard-b", code: "B-01" } }
    );
    const unassigned = container(
      "unassigned-container",
      "TGHU1234567",
      new Date("2026-01-03T00:00:00Z")
    );
    const app = createTestApp(
      new MemoryContainerRepository([assignedToA, assignedToB, unassigned])
    );

    const response = await request(app)
      .get("/api/v1/containers?yardCode=%20a-01%20")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(200);
    expect(response.body.data.map((item: ContainerView) => item.id)).toEqual([
      assignedToA.id
    ]);

    await request(app)
      .get("/api/v1/containers?yardCode=%20%20")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(400);
  });

  it("returns filtered pages of containers without exposing unrelated records", async () => {
    const first = container("container-1", "CSQU3054383", new Date("2026-01-01T00:00:00Z"));
    const second = container("container-2", "MSCU6639870", new Date("2026-01-02T00:00:00Z"), {
      size: "TWENTY_FT",
      type: "REEFER",
      tradeType: "EXPORT",
      status: "STORED"
    });
    const third = container("container-3", "TGHU1234567", new Date("2026-01-03T00:00:00Z"), {
      type: "REEFER",
      tradeType: "EXPORT"
    });
    const app = createTestApp(new MemoryContainerRepository([first, second, third]));
    const response = await request(app)
      .get("/api/v1/containers?search=mscu&size=TWENTY_FT&tradeType=EXPORT&status=STORED&page=1&limit=1")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(200);

    expect(response.body.data.map((item: ContainerView) => item.containerNumber)).toEqual([
      "MSCU6639870"
    ]);
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1
    });

    const secondPage = await request(app)
      .get("/api/v1/containers?type=REEFER&tradeType=EXPORT&page=2&limit=1")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(200);

    expect(secondPage.body.data.map((item: ContainerView) => item.containerNumber)).toEqual([
      "MSCU6639870"
    ]);
    expect(secondPage.body.pagination.total).toBe(2);
  });

  it("validates query parameters and returns container details", async () => {
    const existing = container("container-1", "CSQU3054383", new Date("2026-01-01T00:00:00Z"));
    const app = createTestApp(new MemoryContainerRepository([existing]));

    await request(app)
      .get("/api/v1/containers?page=0")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(400);
    await request(app)
      .get("/api/v1/containers?limit=101")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(400);

    const detail = await request(app)
      .get(`/api/v1/containers/${existing.id}`)
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(200);

    expect(detail.body.container.containerNumber).toBe(existing.containerNumber);

    await request(app)
      .get(`/api/v1/containers/${existing.id}/movements?from=2026-02-30`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    await request(app)
      .get(`/api/v1/containers/${existing.id}/movements/export?from=2026-02-03&to=2026-02-01`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);

    const missing = await request(app)
      .get("/api/v1/containers/missing")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(404);

    expect(missing.body.error.code).toBe("CONTAINER_NOT_FOUND");
    await request(app)
      .get("/api/v1/containers/missing/movements/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);
  });

  it("exports all matching containers across batches and requires authentication", async () => {
    const matchingContainers = Array.from({ length: 501 }, (_, index) =>
      container(
        `export-container-${index}`,
        "CSQU3054383",
        new Date(`2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`),
        {
          size: "TWENTY_FT",
          type: "REEFER",
          tradeType: "EXPORT",
          status: "STORED",
          currentYard: { id: "yard-a-01", code: "A-01" }
        }
      )
    );
    const unrelatedContainer = container(
      "unrelated-container",
      "MSCU6639870",
      new Date("2026-02-01T00:00:00Z"),
      { status: "REGISTERED" }
    );
    const otherYardContainer = container(
      "other-yard-container",
      "CSQU3054383",
      new Date("2026-02-02T00:00:00Z"),
      {
        size: "TWENTY_FT",
        type: "REEFER",
        tradeType: "EXPORT",
        status: "STORED",
        currentYard: { id: "yard-b-01", code: "B-01" }
      }
    );
    const outsideDateContainer = container(
      "outside-date-container",
      "CSQU3054383",
      new Date("2026-02-02T00:00:00Z"),
      {
        size: "TWENTY_FT",
        type: "REEFER",
        tradeType: "EXPORT",
        status: "STORED",
        currentYard: { id: "yard-a-01", code: "A-01" }
      }
    );
    const app = createTestApp(
      new MemoryContainerRepository([
        ...matchingContainers,
        unrelatedContainer,
        otherYardContainer,
        outsideDateContainer
      ])
    );

    await request(app).get("/api/v1/containers/export").expect(401);

    const response = await request(app)
      .get(
        "/api/v1/containers/export?search=csqu&status=STORED&size=TWENTY_FT&type=REEFER&tradeType=EXPORT&yardCode=a-01&from=2026-01-01&to=2026-01-28"
      )
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(200);

    const rows = response.text.split(/\r?\n/).filter(Boolean);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain(
      "portflow-container-inventory.csv"
    );
    expect(rows).toHaveLength(502);
    expect(rows[0]).toBe(
      '"id","containerNumber","size","type","tradeType","status","currentYardCode","createdAt","updatedAt"'
    );
    expect(response.text).toContain('"A-01"');
    expect(response.text).not.toContain('"B-01"');
    expect(response.text).not.toContain("2026-02-02T00:00:00.000Z");

    await request(app)
      .get("/api/v1/containers/export?status=INVALID")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(400);
  });
});

describe("container movement history", () => {
  it("exports the full movement history in batches and protects spreadsheet cells", async () => {
    const stored = container(
      "movement-export-container",
      "CSQU3054383",
      new Date("2026-01-04T00:00:00Z"),
      { status: "STORED" }
    );
    const repository = new MemoryContainerRepository([stored]);
    repository.movementHistory.push(...Array.from({ length: 501 }, (_value, index) => ({
      id: `movement-${index}`,
      containerId: stored.id,
      previousStatus: index === 0 ? null : "STORED" as const,
      nextStatus: "STORED" as const,
      fromYard: null,
      toYard: null,
      description: index === 0 ? "=1+1" : `Movement ${index}`,
      occurredAt: new Date(Date.UTC(2026, 0, 1, 0, index === 500 ? 1440 : index)),
      actor: { id: adminUser.id, name: adminUser.name }
    })));
    const app = createTestApp(repository);

    await request(app)
      .get(`/api/v1/containers/${stored.id}/movements/export`)
      .expect(401);

    const response = await request(app)
      .get(`/api/v1/containers/${stored.id}/movements/export?from=2026-01-01&to=2026-01-01`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const rows = response.text.split("\r\n").filter(Boolean);

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("portflow-container-movements.csv");
    expect(rows).toHaveLength(501);
    expect(rows[0]).toBe(
      '"occurredAt","containerNumber","previousStatus","nextStatus","fromYardCode","toYardCode","description","actorName"'
    );
    expect(rows[1]).toContain("Movement 499");
    expect(response.text).not.toContain("Movement 500");
    expect(response.text).toContain("\"'=1+1\"");
    expect(rows.at(-1)).toContain("CSQU3054383");
  });

  it("returns chronological operational events with locations and pagination", async () => {
    const stored = container(
      "history-container",
      "CSQU3054383",
      new Date("2026-01-04T00:00:00Z"),
      {
        status: "STORED",
        currentYard: { id: "yard-b-01", code: "B-01" }
      }
    );
    const repository = new MemoryContainerRepository([stored]);
    const events = [
      {
        id: "movement-1",
        containerId: stored.id,
        previousStatus: null,
        nextStatus: "REGISTERED" as const,
        fromYard: null,
        toYard: null,
        description: "Container registered",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
        actor: { id: adminUser.id, name: adminUser.name }
      },
      {
        id: "movement-2",
        containerId: stored.id,
        previousStatus: "REGISTERED" as const,
        nextStatus: "IN_YARD" as const,
        fromYard: null,
        toYard: null,
        description: "Container entered through the gate",
        occurredAt: new Date("2026-01-02T00:00:00Z"),
        actor: { id: gateUser.id, name: gateUser.name }
      },
      {
        id: "movement-3",
        containerId: stored.id,
        previousStatus: "IN_YARD" as const,
        nextStatus: "STORED" as const,
        fromYard: null,
        toYard: { id: "yard-a-01", code: "A-01" },
        description: "Container placed in yard A-01",
        occurredAt: new Date("2026-01-03T00:00:00Z"),
        actor: { id: "yard-operator", name: "Demo Yard Operator" }
      },
      {
        id: "movement-4",
        containerId: stored.id,
        previousStatus: "STORED" as const,
        nextStatus: "STORED" as const,
        fromYard: { id: "yard-a-01", code: "A-01" },
        toYard: { id: "yard-b-01", code: "B-01" },
        description: "Container relocated from A-01 to B-01",
        occurredAt: new Date("2026-01-04T00:00:00Z"),
        actor: { id: "yard-operator", name: "Demo Yard Operator" }
      }
    ];
    repository.movementHistory.push(...events);
    const app = createTestApp(repository);
    const firstPage = await request(app)
      .get(`/api/v1/containers/${stored.id}/movements?page=1&limit=2`)
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(200);

    expect(firstPage.body.data.map((event: { id: string }) => event.id)).toEqual([
      "movement-4",
      "movement-3"
    ]);
    expect(firstPage.body.data[0]).toMatchObject({
      previousStatus: "STORED",
      nextStatus: "STORED",
      fromYard: { code: "A-01" },
      toYard: { code: "B-01" }
    });
    expect(firstPage.body.data[0].actor.name).toBe("Demo Yard Operator");
    expect(firstPage.body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2
    });

    const secondPage = await request(app)
      .get(`/api/v1/containers/${stored.id}/movements?page=2&limit=2`)
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(200);

    expect(secondPage.body.data.map((event: { id: string }) => event.id)).toEqual([
      "movement-2",
      "movement-1"
    ]);

    const filteredPage = await request(app)
      .get(`/api/v1/containers/${stored.id}/movements?from=2026-01-02&to=2026-01-03&page=1&limit=2`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(filteredPage.body.data.map((event: { id: string }) => event.id)).toEqual([
      "movement-3",
      "movement-2"
    ]);
    expect(filteredPage.body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 2,
      totalPages: 1
    });
  });

  it("validates pagination and returns not found for a missing container", async () => {
    const repository = new MemoryContainerRepository();
    const app = createTestApp(repository);

    await request(app)
      .get("/api/v1/containers/missing/movements?limit=101")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(400);

    const missing = await request(app)
      .get("/api/v1/containers/missing/movements")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(404);
    expect(missing.body.error.code).toBe("CONTAINER_NOT_FOUND");
  });
});

describe("container lifecycle completion", () => {
  function completedCandidate(id: string, status: ContainerView["status"] = "GATE_OUT") {
    return container(id, "CSQU3054383", new Date("2026-02-01T00:00:00Z"), {
      status,
      currentYard: status === "STORED" ? { id: "yard-a-01", code: "A-01" } : null
    });
  }

  it("allows gate operators and administrators but rejects other roles", async () => {
    const repository = new MemoryContainerRepository([completedCandidate("completion-auth")]);
    const app = createTestApp(repository);

    await request(app)
      .post("/api/v1/containers/completion-auth/complete")
      .expect(401);
    await request(app)
      .post("/api/v1/containers/completion-auth/complete")
      .set("Authorization", `Bearer ${yardToken}`)
      .expect(403);
    await request(app)
      .post("/api/v1/containers/completion-auth/complete")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(201);
  });

  it("completes only a gate-out container and records movement and audit", async () => {
    const candidate = completedCandidate("completion-valid");
    const repository = new MemoryContainerRepository([candidate]);
    const app = createTestApp(repository);
    const response = await request(app)
      .post(`/api/v1/containers/${candidate.id}/complete`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(201);

    expect(response.body.completion).toEqual({
      id: candidate.id,
      containerNumber: "CSQU3054383",
      previousStatus: "GATE_OUT",
      status: "COMPLETED"
    });
    expect(candidate.status).toBe("COMPLETED");
    expect(repository.movementHistory.at(-1)).toMatchObject({
      containerId: candidate.id,
      previousStatus: "GATE_OUT",
      nextStatus: "COMPLETED",
      description: "Container lifecycle completed",
      actor: { id: adminUser.id }
    });
    expect(repository.auditEntries).toEqual([
      {
        action: "CONTAINER_COMPLETED",
        entityId: candidate.id,
        actorId: adminUser.id
      }
    ]);
  });

  it("rejects repeated completion without duplicate records", async () => {
    const candidate = completedCandidate("completion-duplicate");
    const repository = new MemoryContainerRepository([candidate]);
    const app = createTestApp(repository);
    const route = () =>
      request(app)
        .post(`/api/v1/containers/${candidate.id}/complete`)
        .set("Authorization", `Bearer ${gateToken}`);

    await route().expect(201);
    const duplicate = await route().expect(409);

    expect(duplicate.body.error.code).toBe("CONTAINER_ALREADY_COMPLETED");
    expect(repository.movementHistory).toHaveLength(1);
    expect(repository.auditEntries).toHaveLength(1);
  });

  it.each(["REGISTERED", "IN_YARD", "STORED"] as const)(
    "rejects completion while container is %s",
    async (status) => {
      const candidate = completedCandidate(`completion-${status}`, status);
      const repository = new MemoryContainerRepository([candidate]);
      const app = createTestApp(repository);
      const response = await request(app)
        .post(`/api/v1/containers/${candidate.id}/complete`)
        .set("Authorization", `Bearer ${gateToken}`)
        .expect(409);

      expect(response.body.error.code).toBe("INVALID_CONTAINER_STATE");
      expect(candidate.status).toBe(status);
      expect(repository.movementHistory).toHaveLength(0);
      expect(repository.auditEntries).toHaveLength(0);
    }
  );

  it("rejects a gate-out container that still has a yard location", async () => {
    const candidate = completedCandidate("completion-located");
    candidate.currentYard = { id: "yard-a-01", code: "A-01" };
    const repository = new MemoryContainerRepository([candidate]);
    const app = createTestApp(repository);
    const response = await request(app)
      .post(`/api/v1/containers/${candidate.id}/complete`)
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(409);

    expect(response.body.error.code).toBe("INVALID_CONTAINER_STATE");
    expect(repository.movementHistory).toHaveLength(0);
  });

  it("returns not found and rolls back a failed completion", async () => {
    const missingRepository = new MemoryContainerRepository();
    const missingApp = createTestApp(missingRepository);
    const missing = await request(missingApp)
      .post("/api/v1/containers/missing/complete")
      .set("Authorization", `Bearer ${gateToken}`)
      .expect(404);
    expect(missing.body.error.code).toBe("CONTAINER_NOT_FOUND");

    const candidate = completedCandidate("completion-rollback");
    const repository = new MemoryContainerRepository([candidate]);
    repository.failBeforeCompletionCommit = true;
    const app = createTestApp(repository);
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await request(app)
        .post(`/api/v1/containers/${candidate.id}/complete`)
        .set("Authorization", `Bearer ${gateToken}`)
        .expect(500);
    } finally {
      logError.mockRestore();
    }

    expect(candidate.status).toBe("GATE_OUT");
    expect(repository.movementHistory).toHaveLength(0);
    expect(repository.auditEntries).toHaveLength(0);
  });
});
