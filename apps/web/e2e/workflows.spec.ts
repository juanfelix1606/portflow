import { expect, test } from "@playwright/test";
import type { ContainerMovement, ContainerRecord } from "../src/dashboard-api.js";
import type { Page, Route } from "@playwright/test";

const apiPrefix = "http://localhost:3000/api/v1";
const apiPath = "/api/v1";
const appOrigin = "http://127.0.0.1:4173";
const csrfToken = "fictional-csrf-token-for-e2e";
const accessToken = "fictional-access-token-for-e2e";

interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "GATE_OPERATOR" | "YARD_OPERATOR";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DemoYard {
  id: string;
  code: string;
  zone: string;
  capacity: number;
  occupied: number;
  isActive: boolean;
}

interface DemoGateTransaction {
  id: string;
  direction: "IN" | "OUT";
  vehiclePlate: string;
  driverName: string;
  occurredAt: string;
  container: { id: string; containerNumber: string };
  operator: { id: string; name: string };
}

interface DemoAuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string;
  actorName: string | null;
  action: string;
  entityType: "CONTAINER" | "USER" | "YARD";
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  occurredAt: string;
}

async function respond(route: Route, value: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": appOrigin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      "access-control-allow-headers": "authorization,content-type,x-csrf-token"
    },
    body: JSON.stringify(value)
  });
}

async function respondCsv(route: Route, body: string, filename: string): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "text/csv; charset=utf-8",
    headers: {
      "access-control-allow-origin": appOrigin,
      "access-control-allow-credentials": "true",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store"
    },
    body
  });
}

async function installApiMocks(
  page: Page,
  role: DemoUser["role"],
  initiallyRequiresPasswordChange = false
): Promise<{
  getContainerStatus: () => string;
  getContainerListTypeFilter: () => string | null;
  getContainerExportTypeFilter: () => string | null;
  getContainerListYardFilter: () => string | null;
  getContainerExportYardFilter: () => string | null;
  getContainerListDateRange: () => { from: string | null; to: string | null };
  getContainerExportDateRange: () => { from: string | null; to: string | null };
  getDashboardDateRange: () => { from: string | null; to: string | null };
  getDashboardExportDateRange: () => { from: string | null; to: string | null };
  getMovementListDateRange: () => { from: string | null; to: string | null };
  getMovementExportDateRange: () => { from: string | null; to: string | null };
  getUserExportFilters: () => { search: string | null; role: string | null; isActive: string | null };
  getUsers: () => DemoUser[];
  getYards: () => DemoYard[];
}> {
  const demoTime = "2026-02-01T10:00:00.000Z";
  let passwordChangeRequired = initiallyRequiresPasswordChange;
  const container: ContainerRecord = {
    id: "demo-container",
    containerNumber: "CSQU3054383",
    size: "FORTY_FT",
    type: "DRY",
    tradeType: "IMPORT",
    status: "REGISTERED",
    currentYard: null,
    createdAt: demoTime,
    updatedAt: demoTime
  };
  let containerListTypeFilter: string | null = null;
  let containerExportTypeFilter: string | null = null;
  let containerListYardFilter: string | null = null;
  let containerExportYardFilter: string | null = null;
  let containerListDateRange = { from: null as string | null, to: null as string | null };
  let containerExportDateRange = { from: null as string | null, to: null as string | null };
  let dashboardDateRange = { from: null as string | null, to: null as string | null };
  let dashboardExportDateRange = { from: null as string | null, to: null as string | null };
  let movementListDateRange = { from: null as string | null, to: null as string | null };
  let movementExportDateRange = { from: null as string | null, to: null as string | null };
  let userExportFilters = {
    search: null as string | null,
    role: null as string | null,
    isActive: null as string | null
  };
  const movements: ContainerMovement[] = [
    {
      id: "movement-1",
      previousStatus: null,
      nextStatus: "REGISTERED",
      fromYard: null,
      toYard: null,
      description: "Container registered",
      occurredAt: demoTime,
      actor: { id: "demo-admin", name: "Demo Administrator" }
    }
  ];
  const users: DemoUser[] = [
    {
      id: "demo-admin",
      name: "Demo Administrator",
      email: "admin@portflow.test",
      role: "ADMIN",
      isActive: true,
      createdAt: demoTime,
      updatedAt: demoTime
    },
    {
      id: "demo-gate",
      name: "Demo Gate Operator",
      email: "gate@portflow.test",
      role: "GATE_OPERATOR",
      isActive: true,
      createdAt: demoTime,
      updatedAt: demoTime
    }
  ];
  const yards: DemoYard[] = [
    { id: "yard-a-01", code: "A-01", zone: "A", capacity: 10, occupied: 0, isActive: true },
    { id: "yard-b-01", code: "B-01", zone: "B", capacity: 12, occupied: 0, isActive: true }
  ];
  const gateTransactions: DemoGateTransaction[] = [
    {
      id: "gate-in-demo",
      direction: "IN",
      vehiclePlate: "AB-1234",
      driverName: "Demo Driver One",
      occurredAt: demoTime,
      container: { id: container.id, containerNumber: container.containerNumber },
      operator: { id: "demo-gate", name: "Demo Gate Operator" }
    },
    {
      id: "gate-out-demo",
      direction: "OUT",
      vehiclePlate: "XY-9876",
      driverName: "Demo Driver Two",
      occurredAt: "2026-02-02T10:00:00.000Z",
      container: { id: container.id, containerNumber: container.containerNumber },
      operator: { id: "demo-gate", name: "Demo Gate Operator" }
    }
  ];
  const auditLogs: DemoAuditLog[] = [
    {
      id: "audit-container",
      actorId: "demo-admin",
      actorEmail: "admin@portflow.test",
      actorName: "Demo Administrator",
      action: "CONTAINER_REGISTERED",
      entityType: "CONTAINER",
      entityId: "demo-container",
      oldValue: null,
      newValue: { containerNumber: "CSQU3054383", status: "REGISTERED" },
      occurredAt: demoTime
    },
    {
      id: "audit-user",
      actorId: "demo-admin",
      actorEmail: "admin@portflow.test",
      actorName: "Demo Administrator",
      action: "USER_CREATED",
      entityType: "USER",
      entityId: "demo-gate",
      oldValue: null,
      newValue: { name: "Demo Gate Operator", role: "GATE_OPERATOR" },
      occurredAt: "2026-02-02T10:00:00.000Z"
    }
  ];

  await page.route(`${apiPrefix}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(apiPath.length);
    const method = request.method();

    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": appOrigin,
          "access-control-allow-credentials": "true",
          "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
          "access-control-allow-headers": "authorization,content-type,x-csrf-token"
        }
      });
      return;
    }

    if (path === "/auth/csrf") {
      await respond(route, { csrfToken });
      return;
    }
    if (path === "/auth/refresh") {
      await respond(
        route,
        { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } },
        401
      );
      return;
    }
    if (path === "/auth/login") {
      await respond(route, {
        user: {
          id: role === "ADMIN" ? "demo-admin" : "demo-gate",
          name: role === "ADMIN" ? "Demo Administrator" : "Demo Gate Operator",
          email: role === "ADMIN" ? "admin@portflow.test" : "gate@portflow.test",
          role,
          mustChangePassword: passwordChangeRequired
        },
        accessToken,
        csrfToken
      });
      return;
    }
    if (path === "/auth/password/change" && method === "POST") {
      passwordChangeRequired = false;
      await respond(route, { passwordChanged: true });
      return;
    }
    if (path === "/auth/logout" && method === "POST") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": appOrigin,
          "access-control-allow-credentials": "true"
        }
      });
      return;
    }
    if (path === "/dashboard/summary/export") {
      dashboardExportDateRange = {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to")
      };
      await respondCsv(
        route,
        "section,metric,date,dimension,value,unit\r\nactivity,gate_transactions_total,,IN,2,transactions\r\n",
        "portflow-dashboard-activity.csv"
      );
      return;
    }
    if (path === "/dashboard/summary") {
      dashboardDateRange = {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to")
      };
      await respond(route, {
        summary: {
          generatedAt: demoTime,
          containerCounts: {
            total: 1,
            byStatus: {
              REGISTERED: container.status === "REGISTERED" ? 1 : 0,
              IN_YARD: container.status === "IN_YARD" ? 1 : 0,
              STORED: container.status === "STORED" ? 1 : 0,
              GATE_OUT: container.status === "GATE_OUT" ? 1 : 0,
              COMPLETED: container.status === "COMPLETED" ? 1 : 0
            }
          },
          yardCapacity: {
            activeYards: 1,
            capacity: 60,
            occupied: 10,
            available: 50,
            utilizationPercent: 17,
            locations: Array.from({ length: 6 }, (_value, index) => ({
              id: `yard-a-0${index + 1}`,
              code: `A-0${index + 1}`,
              zone: "A",
              occupied: index === 0 ? 10 : 0,
              capacity: 10
            }))
          },
          gateActivity: {
            byDirection: { IN: 0, OUT: 0 },
            byDay: [{ date: "2026-02-01", byDirection: { IN: 2, OUT: 1 } }]
          },
          recentMovements: []
        }
      });
      return;
    }
    if (path === "/gate" && method === "GET") {
      const search = url.searchParams.get("search")?.toLocaleLowerCase();
      const direction = url.searchParams.get("direction");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const matching = gateTransactions.filter((transaction) =>
        (!direction || transaction.direction === direction) &&
        (!from || transaction.occurredAt.slice(0, 10) >= from) &&
        (!to || transaction.occurredAt.slice(0, 10) <= to) &&
        (!search || [
          transaction.container.containerNumber,
          transaction.vehiclePlate,
          transaction.driverName,
          transaction.operator.name
        ].some((value) => value.toLocaleLowerCase().includes(search)))
      );
      const page = Number(url.searchParams.get("page") ?? 1);
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const start = (page - 1) * limit;
      await respond(route, {
        data: matching.slice(start, start + limit),
        pagination: {
          page,
          limit,
          total: matching.length,
          totalPages: Math.ceil(matching.length / limit)
        }
      });
      return;
    }
    if (path === "/gate/export" && method === "GET") {
      const search = url.searchParams.get("search")?.toLocaleLowerCase();
      const direction = url.searchParams.get("direction");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const matching = gateTransactions.filter((transaction) =>
        (!direction || transaction.direction === direction) &&
        (!from || transaction.occurredAt.slice(0, 10) >= from) &&
        (!to || transaction.occurredAt.slice(0, 10) <= to) &&
        (!search || [
          transaction.container.containerNumber,
          transaction.vehiclePlate,
          transaction.driverName,
          transaction.operator.name
        ].some((value) => value.toLocaleLowerCase().includes(search)))
      );
      const rows = matching.map((transaction) =>
        [
          transaction.occurredAt,
          transaction.direction,
          transaction.container.containerNumber,
          transaction.vehiclePlate,
          transaction.driverName,
          transaction.operator.name
        ].map((value) => `"${value}"`).join(",")
      );
      await respondCsv(
        route,
        ["occurredAt,direction,containerNumber,vehiclePlate,driverName,operatorName", ...rows].join("\r\n"),
        "portflow-gate-history.csv"
      );
      return;
    }
    if (path === "/audit" && method === "GET") {
      const search = url.searchParams.get("search")?.toLocaleLowerCase();
      const entityType = url.searchParams.get("entityType");
      const action = url.searchParams.get("action");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const matching = auditLogs.filter((entry) =>
        (!entityType || entry.entityType === entityType) &&
        (!action || entry.action === action) &&
        (!from || entry.occurredAt.slice(0, 10) >= from) &&
        (!to || entry.occurredAt.slice(0, 10) <= to) &&
        (!search || [
          entry.actorEmail,
          entry.actorName ?? "",
          entry.action,
          entry.entityType,
          entry.entityId
        ].some((value) => value.toLocaleLowerCase().includes(search)))
      );
      const page = Number(url.searchParams.get("page") ?? 1);
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const start = (page - 1) * limit;
      await respond(route, {
        data: matching.slice(start, start + limit),
        pagination: {
          page,
          limit,
          total: matching.length,
          totalPages: Math.ceil(matching.length / limit)
        }
      });
      return;
    }
    if (path === "/audit/export" && method === "GET") {
      const search = url.searchParams.get("search")?.toLocaleLowerCase();
      const entityType = url.searchParams.get("entityType");
      const action = url.searchParams.get("action");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const matching = auditLogs.filter((entry) =>
        (!entityType || entry.entityType === entityType) &&
        (!action || entry.action === action) &&
        (!from || entry.occurredAt.slice(0, 10) >= from) &&
        (!to || entry.occurredAt.slice(0, 10) <= to) &&
        (!search || [
          entry.actorEmail,
          entry.actorName ?? "",
          entry.action,
          entry.entityType,
          entry.entityId
        ].some((value) => value.toLocaleLowerCase().includes(search)))
      );
      const rows = matching.map((entry) =>
        [
          entry.occurredAt,
          entry.actorName ?? "",
          entry.actorEmail,
          entry.action,
          entry.entityType,
          entry.entityId,
          JSON.stringify(entry.oldValue),
          JSON.stringify(entry.newValue)
        ].map((value) => `"${value}"`).join(",")
      );
      await respondCsv(
        route,
        [
          "occurredAt,actorName,actorEmail,action,entityType,entityId,oldValue,newValue",
          ...rows
        ].join("\r\n"),
        "portflow-audit-log.csv"
      );
      return;
    }
    if (path === "/yard/export" && method === "GET") {
      await respondCsv(
        route,
        "zone,yardCode,capacity,occupied,available,isActive,utilizationPercent\r\nA,A-01,10,1,9,true,10.00\r\n",
        "portflow-yard-occupancy.csv"
      );
      return;
    }
    if (path === "/yard" && method === "GET") {
      await respond(route, { data: yards });
      return;
    }
    if (path.startsWith("/yard/") && method === "PATCH") {
      const yardId = path.slice("/yard/".length);
      const yard = yards.find((candidate) => candidate.id === yardId);
      if (!yard) {
        await respond(route, { error: { code: "YARD_NOT_FOUND", message: "Yard not found." } }, 404);
        return;
      }
      Object.assign(yard, request.postDataJSON());
      await respond(route, { yard });
      return;
    }
    if (path === "/containers/import/preview" && method === "POST") {
      const csv = request.postData() ?? "";
      const rows = csv.split(/\r?\n/).slice(1).filter(Boolean);
      const values = rows.map((row) => row.split(","));
      const numbers = values.map((row) => row[0]);
      const duplicateRow = numbers.findIndex((number, index) => numbers.indexOf(number) !== index);
      if (duplicateRow >= 0) {
        await respond(
          route,
          {
            error: {
              code: "CONTAINER_IMPORT_VALIDATION_FAILED",
              message: "No containers were imported because the CSV contains invalid rows.",
              details: [{
                row: duplicateRow + 2,
                column: "containerNumber",
                message: `Container number duplicates row ${numbers.indexOf(numbers[duplicateRow]) + 2}.`
              }]
            }
          },
          400
        );
        return;
      }
      if (numbers.includes(container.containerNumber)) {
        await respond(
          route,
          {
            error: {
              code: "CONTAINER_IMPORT_CONFLICT",
              message: "The preview found container numbers that are already registered.",
              details: [{
                row: numbers.indexOf(container.containerNumber) + 2,
                column: "containerNumber",
                message: "This container number is already registered."
              }]
            }
          },
          409
        );
        return;
      }
      await respond(route, {
        rowCount: rows.length,
        sample: values.slice(0, 10).map(([containerNumber, size, type, tradeType], index) => ({
          row: index + 2,
          containerNumber,
          size,
          type,
          tradeType
        }))
      });
      return;
    }
    if (path === "/containers/import" && method === "POST") {
      const csv = request.postData() ?? "";
      const rows = csv.split(/\r?\n/).slice(1).filter(Boolean);
      const numbers = rows.map((row) => row.split(",")[0]);
      const duplicateRow = numbers.findIndex((number, index) => numbers.indexOf(number) !== index);
      if (duplicateRow >= 0) {
        await respond(
          route,
          {
            error: {
              code: "CONTAINER_IMPORT_VALIDATION_FAILED",
              message: "No containers were imported because the CSV contains invalid rows.",
              details: [{
                row: duplicateRow + 2,
                column: "containerNumber",
                message: `Container number duplicates row ${numbers.indexOf(numbers[duplicateRow]) + 2}.`
              }]
            }
          },
          400
        );
        return;
      }
      await respond(route, { importedCount: rows.length, containers: [] }, 201);
      return;
    }
    if (path === "/containers" && method === "GET") {
      const search = url.searchParams.get("search")?.toUpperCase();
      const status = url.searchParams.get("status");
      const size = url.searchParams.get("size");
      const type = url.searchParams.get("type");
      const tradeType = url.searchParams.get("tradeType");
      const yardCode = url.searchParams.get("yardCode");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      containerListTypeFilter = type;
      containerListYardFilter = yardCode;
      containerListDateRange = { from, to };
      const matches =
        (!search || container.containerNumber.includes(search)) &&
        (!status || container.status === status) &&
        (!size || container.size === size) &&
        (!type || container.type === type) &&
        (!tradeType || container.tradeType === tradeType) &&
        (!yardCode || container.currentYard?.code === yardCode) &&
        (!from || container.createdAt.slice(0, 10) >= from) &&
        (!to || container.createdAt.slice(0, 10) <= to);
      await respond(route, {
        data: matches ? [container] : [],
        pagination: {
          page: Number(url.searchParams.get("page") ?? 1),
          limit: 20,
          total: matches ? 1 : 0,
          totalPages: matches ? 1 : 0
        }
      });
      return;
    }
    if (path === "/containers/export" && method === "GET") {
      const search = url.searchParams.get("search")?.toUpperCase();
      const status = url.searchParams.get("status");
      const size = url.searchParams.get("size");
      const type = url.searchParams.get("type");
      const tradeType = url.searchParams.get("tradeType");
      const yardCode = url.searchParams.get("yardCode");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      containerExportTypeFilter = type;
      containerExportYardFilter = yardCode;
      containerExportDateRange = { from, to };
      const matches =
        (!search || container.containerNumber.includes(search)) &&
        (!status || container.status === status) &&
        (!size || container.size === size) &&
        (!type || container.type === type) &&
        (!tradeType || container.tradeType === tradeType) &&
        (!yardCode || container.currentYard?.code === yardCode) &&
        (!from || container.createdAt.slice(0, 10) >= from) &&
        (!to || container.createdAt.slice(0, 10) <= to);
      await respondCsv(
        route,
        matches
          ? [
              '"id","containerNumber","size","type","tradeType","status","currentYardCode","createdAt","updatedAt"',
              `"${container.id}","${container.containerNumber}","${container.size}","${container.type}","${container.tradeType}","${container.status}","${container.currentYard?.code ?? ""}","${container.createdAt}","${container.updatedAt}"`
            ].join("\r\n")
          : '"id","containerNumber","size","type","tradeType","status","currentYardCode","createdAt","updatedAt"',
        "portflow-container-inventory.csv"
      );
      return;
    }
    if (path === "/containers" && method === "POST") {
      const input = request.postDataJSON() as {
        containerNumber: string;
        size: string;
        type: string;
        tradeType: string;
      };
      Object.assign(container, input, {
        id: "new-container",
        status: "REGISTERED",
        currentYard: null
      });
      await respond(route, { container }, 201);
      return;
    }
    if (path === "/gate/in" && method === "POST") {
      const input = request.postDataJSON() as { vehiclePlate: string; driverName: string };
      container.status = "IN_YARD";
      gateTransactions.unshift({
        id: `gate-in-${gateTransactions.length + 1}`,
        direction: "IN",
        vehiclePlate: input.vehiclePlate,
        driverName: input.driverName,
        occurredAt: demoTime,
        container: { id: container.id, containerNumber: container.containerNumber },
        operator: { id: "demo-gate", name: "Demo Gate Operator" }
      });
      movements.unshift({
        id: `movement-${movements.length + 1}`,
        previousStatus: "REGISTERED",
        nextStatus: "IN_YARD",
        fromYard: null,
        toYard: null,
        description: "Container entered through the gate",
        occurredAt: demoTime,
        actor: { id: "demo-gate", name: "Demo Gate Operator" }
      });
      await respond(route, { gateTransaction: { direction: "IN" } }, 201);
      return;
    }
    if (path === "/yard/placement" && method === "POST") {
      const input = request.postDataJSON() as { yardCode: string };
      container.status = "STORED";
      container.currentYard = { id: "yard-a-01", code: input.yardCode };
      movements.unshift({
        id: `movement-${movements.length + 1}`,
        previousStatus: "IN_YARD",
        nextStatus: "STORED",
        fromYard: null,
        toYard: container.currentYard,
        description: `Container placed in yard ${input.yardCode}`,
        occurredAt: demoTime,
        actor: { id: "demo-gate", name: "Demo Gate Operator" }
      });
      await respond(route, { placement: { container } }, 201);
      return;
    }
    if (path === "/yard/relocation" && method === "POST") {
      const input = request.postDataJSON() as { yardCode: string };
      const previousYard = container.currentYard;
      container.currentYard = { id: "yard-b-01", code: input.yardCode };
      movements.unshift({
        id: `movement-${movements.length + 1}`,
        previousStatus: "STORED",
        nextStatus: "STORED",
        fromYard: previousYard,
        toYard: container.currentYard,
        description: `Container relocated to ${input.yardCode}`,
        occurredAt: demoTime,
        actor: { id: "demo-gate", name: "Demo Gate Operator" }
      });
      await respond(route, { relocation: { container } }, 201);
      return;
    }
    if (path === "/gate/out" && method === "POST") {
      const input = request.postDataJSON() as { vehiclePlate: string; driverName: string };
      const previousYard = container.currentYard;
      container.status = "GATE_OUT";
      container.currentYard = null;
      gateTransactions.unshift({
        id: `gate-out-${gateTransactions.length + 1}`,
        direction: "OUT",
        vehiclePlate: input.vehiclePlate,
        driverName: input.driverName,
        occurredAt: demoTime,
        container: { id: container.id, containerNumber: container.containerNumber },
        operator: { id: "demo-gate", name: "Demo Gate Operator" }
      });
      movements.unshift({
        id: `movement-${movements.length + 1}`,
        previousStatus: "STORED",
        nextStatus: "GATE_OUT",
        fromYard: previousYard,
        toYard: null,
        description: "Container exited through the gate",
        occurredAt: demoTime,
        actor: { id: "demo-gate", name: "Demo Gate Operator" }
      });
      await respond(route, { gateTransaction: { direction: "OUT" } }, 201);
      return;
    }
    if (path === `/containers/${container.id}/complete` && method === "POST") {
      container.status = "COMPLETED";
      movements.unshift({
        id: `movement-${movements.length + 1}`,
        previousStatus: "GATE_OUT",
        nextStatus: "COMPLETED",
        fromYard: null,
        toYard: null,
        description: "Container lifecycle completed",
        occurredAt: demoTime,
        actor: { id: "demo-gate", name: "Demo Gate Operator" }
      });
      await respond(route, { completion: { status: "COMPLETED" } }, 201);
      return;
    }
    if (path === `/containers/${container.id}/movements/export`) {
      movementExportDateRange = {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to")
      };
      await respondCsv(
        route,
        "occurredAt,containerNumber,previousStatus,nextStatus,fromYardCode,toYardCode,description,actorName\r\n2026-02-01T10:00:00.000Z,CSQU3054383,,REGISTERED,,,Container registered,Demo Administrator\r\n",
        `portflow-${container.containerNumber}-movements.csv`
      );
      return;
    }
    if (path === `/containers/${container.id}/movements`) {
      movementListDateRange = {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to")
      };
      await respond(route, {
        data: movements,
        pagination: { page: 1, limit: 10, total: movements.length, totalPages: 1 }
      });
      return;
    }
    if (path === `/containers/${container.id}`) {
      await respond(route, { container });
      return;
    }
    if (path === "/users/export" && method === "GET") {
      userExportFilters = {
        search: url.searchParams.get("search"),
        role: url.searchParams.get("role"),
        isActive: url.searchParams.get("isActive")
      };
      await respondCsv(
        route,
        "userId,name,email,role,isActive,createdAt,updatedAt\r\ndemo-yard,Demo Yard Operator,yard@portflow.test,YARD_OPERATOR,true,2026-02-01T10:00:00.000Z,2026-02-01T10:00:00.000Z\r\n",
        "portflow-managed-users.csv"
      );
      return;
    }
    if (path === "/users" && method === "GET") {
      const search = url.searchParams.get("search")?.toLowerCase();
      const roleFilter = url.searchParams.get("role");
      const activeFilter = url.searchParams.get("isActive");
      const matches = users.filter((user) =>
        (!search || `${user.name} ${user.email}`.toLowerCase().includes(search)) &&
        (!roleFilter || user.role === roleFilter) &&
        (activeFilter === null || user.isActive === (activeFilter === "true"))
      );
      await respond(route, {
        data: matches,
        pagination: {
          page: Number(url.searchParams.get("page") ?? 1),
          limit: 20,
          total: matches.length,
          totalPages: matches.length ? 1 : 0
        }
      });
      return;
    }
    if (path === "/users" && method === "POST") {
      const input = request.postDataJSON() as Omit<DemoUser, "id" | "isActive" | "createdAt" | "updatedAt"> & { password: string };
      const created: DemoUser = {
        id: "demo-yard",
        name: input.name,
        email: input.email,
        role: input.role,
        isActive: true,
        createdAt: demoTime,
        updatedAt: demoTime
      };
      users.push(created);
      await respond(route, { user: created }, 201);
      return;
    }
    if (path.endsWith("/password") && method === "PATCH") {
      await respond(route, { reset: true });
      return;
    }
    if (path.startsWith("/users/") && method === "PATCH") {
      const userId = path.slice("/users/".length);
      const user = users.find((candidate) => candidate.id === userId);
      if (!user) {
        await respond(route, { error: { code: "USER_NOT_FOUND", message: "User not found." } }, 404);
        return;
      }
      Object.assign(user, request.postDataJSON(), { updatedAt: demoTime });
      await respond(route, { user });
      return;
    }

    await respond(
      route,
      { error: { code: "NOT_FOUND", message: `No demo API route for ${method} ${path}.` } },
      404
    );
  });

  return {
    getContainerStatus: () => container.status,
    getContainerListTypeFilter: () => containerListTypeFilter,
    getContainerExportTypeFilter: () => containerExportTypeFilter,
    getContainerListYardFilter: () => containerListYardFilter,
    getContainerExportYardFilter: () => containerExportYardFilter,
    getContainerListDateRange: () => containerListDateRange,
    getContainerExportDateRange: () => containerExportDateRange,
    getDashboardDateRange: () => dashboardDateRange,
    getDashboardExportDateRange: () => dashboardExportDateRange,
    getMovementListDateRange: () => movementListDateRange,
    getMovementExportDateRange: () => movementExportDateRange,
    getUserExportFilters: () => userExportFilters,
    getUsers: () => users,
    getYards: () => yards
  };
}

async function signIn(
  page: Page,
  role: DemoUser["role"]
): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  await page.getByLabel("Email address").fill(
    role === "ADMIN" ? "admin@portflow.test" : "gate@portflow.test"
  );
  await page.getByLabel("Password").fill("FictionalDemoPassword#1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
}

test("administrator filters dashboard activity by UTC date range", async ({ page }) => {
  const api = await installApiMocks(page, "ADMIN");
  await signIn(page, "ADMIN");

  await page.getByLabel("Activity from date (UTC)").fill("2026-02-01");
  await page.getByLabel("Activity to date (UTC)").fill("2026-02-03");
  await page.getByRole("button", { name: "Apply range" }).click();

  await expect(page.getByText("Latest container events in UTC 2026-02-01 – 2026-02-03")).toBeVisible();
  await expect(page.getByRole("img", { name: "Daily gate transactions by direction" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Daily gate transactions by UTC date" }))
    .toContainText("2026-02-01");
  await expect(page.getByText("Full", { exact: true })).toBeVisible();
  await expect(page.getByText("A-06")).toBeHidden();
  await page.getByText("Show 1 more location").click();
  await expect(page.getByText("A-06")).toBeVisible();
  await expect.poll(() => api.getDashboardDateRange()).toEqual({
    from: "2026-02-01",
    to: "2026-02-03"
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("portflow-dashboard-activity.csv");
  await expect.poll(() => api.getDashboardExportDateRange()).toEqual({
    from: "2026-02-01",
    to: "2026-02-03"
  });
});

test("administrator completes the container workflow through the browser", async ({ page }) => {
  const api = await installApiMocks(page, "ADMIN");
  await signIn(page, "ADMIN");

  await page.getByRole("button", { name: "Containers" }).click();
  await expect(page.getByRole("heading", { name: "Container register" })).toBeVisible();
  await page.getByLabel("Search by container number").fill("CSQU");
  const containerFilters = page.locator("form").filter({
    has: page.getByPlaceholder("e.g. CSQU3054383")
  });
  await containerFilters.locator("select").nth(0).selectOption("REGISTERED");
  await containerFilters.locator("select").nth(1).selectOption("FORTY_FT");
  await containerFilters.locator("select").nth(2).selectOption("DRY");
  await containerFilters.locator("select").nth(3).selectOption("IMPORT");
  const yardCodeInput = page.getByLabel("Current yard code");
  await yardCodeInput.fill("a-01");
  await page.getByLabel("Container created from date (UTC)").fill("2026-02-01");
  await page.getByLabel("Container created to date (UTC)").fill("2026-02-01");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No containers match these filters.")).toBeVisible();
  expect(api.getContainerListTypeFilter()).toBe("DRY");
  expect(api.getContainerListYardFilter()).toBe("A-01");
  expect(api.getContainerListDateRange()).toEqual({
    from: "2026-02-01",
    to: "2026-02-01"
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "portflow-container-inventory.csv"
  );
  expect(api.getContainerExportTypeFilter()).toBe("DRY");
  expect(api.getContainerExportYardFilter()).toBe("A-01");
  expect(api.getContainerExportDateRange()).toEqual({
    from: "2026-02-01",
    to: "2026-02-01"
  });
  await yardCodeInput.fill("");
  await containerFilters.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "CSQU3054383" })).toBeVisible();
  await containerFilters.locator("select").nth(0).selectOption("");
  await containerFilters.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Movement from date (UTC)").fill("2026-02-01");
  await page.getByLabel("Movement to date (UTC)").fill("2026-02-03");
  await expect.poll(() => api.getMovementListDateRange()).toEqual({
    from: "2026-02-01",
    to: "2026-02-03"
  });
  const movementDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export movement history CSV" }).click();
  expect((await movementDownloadPromise).suggestedFilename()).toBe(
    "portflow-CSQU3054383-movements.csv"
  );
  expect(api.getMovementExportDateRange()).toEqual({
    from: "2026-02-01",
    to: "2026-02-03"
  });

  await page.getByRole("button", { name: "Gate-in", exact: true }).click();
  await page.getByLabel("Vehicle plate").fill("AB-1234");
  await page.getByLabel("Driver name").fill("Fictional Demo Driver");
  await page.getByRole("button", { name: "Record gate-in" }).click();
  await expect(page.getByRole("status")).toContainText("Record gate-in recorded");
  await expect(
    page.getByRole("row").filter({ hasText: "CSQU3054383" }).getByText("In yard")
  ).toBeVisible();

  await page.getByRole("button", { name: "Place in yard", exact: true }).click();
  await page.getByLabel("Destination yard code").fill("A-01");
  await page.getByRole("button", { name: "Place in yard", exact: true }).last().click();
  await expect(page.getByRole("status")).toContainText("Place in yard recorded");
  await expect(
    page.getByRole("row").filter({ hasText: "CSQU3054383" }).getByText("Stored")
  ).toBeVisible();

  await page.getByRole("button", { name: "Relocate", exact: true }).click();
  await page.getByLabel("Destination yard code").fill("B-01");
  await page.getByRole("button", { name: "Relocate container", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Relocate container recorded");
  await expect(page.getByText("B-01").first()).toBeVisible();

  await page.getByRole("button", { name: "Gate-out", exact: true }).click();
  await page.getByLabel("Vehicle plate").fill("AB-1234");
  await page.getByLabel("Driver name").fill("Fictional Demo Driver");
  await page.getByRole("button", { name: "Record gate-out" }).click();
  await expect(page.getByRole("status")).toContainText("Record gate-out recorded");
  await expect(
    page.getByRole("row").filter({ hasText: "CSQU3054383" }).getByText("Gate out")
  ).toBeVisible();

  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await page.getByRole("button", { name: "Complete lifecycle" }).click();
  await expect(page.getByRole("status")).toContainText("Complete lifecycle recorded");
  await expect(
    page.getByRole("row").filter({ hasText: "CSQU3054383" }).getByText("Completed")
  ).toBeVisible();
  expect(api.getContainerStatus()).toBe("COMPLETED");
});

test("administrator can import a CSV inventory and view row-level errors", async ({ page }) => {
  await installApiMocks(page, "ADMIN");
  await signIn(page, "ADMIN");
  await page.getByRole("button", { name: "Containers" }).click();
  await page.getByText("Import containers from CSV").click();

  const templateDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV template" }).click();
  const templateDownload = await templateDownloadPromise;
  expect(templateDownload.suggestedFilename()).toBe(
    "portflow-container-import-template.csv"
  );
  const templateStream = await templateDownload.createReadStream();
  if (!templateStream) {
    throw new Error("The CSV template download stream was not available.");
  }
  let templateContents = "";
  for await (const chunk of templateStream) {
    templateContents += chunk.toString();
  }
  expect(templateContents).toBe("containerNumber,size,type,tradeType\r\n");

  const fileInput = page.getByLabel("Container inventory CSV");
  await fileInput.setInputFiles({
    name: "duplicate-containers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "containerNumber,size,type,tradeType",
      "CSQU3054383,FORTY_FT,DRY,IMPORT",
      "CSQU3054383,FORTY_FT,DRY,IMPORT"
    ].join("\r\n"))
  });
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Row 3 (containerNumber): Container number duplicates row 2."
  );

  await fileInput.setInputFiles({
    name: "containers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "containerNumber,size,type,tradeType",
      "TGHU1234567,FORTY_FT,DRY,IMPORT",
      "MSCU6639870,TWENTY_FT,REEFER,EXPORT"
    ].join("\r\n"))
  });
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Preview passed: 2 containers ready to import."
  );
  await expect(page.getByText("TGHU1234567")).toBeVisible();
  await page.getByRole("button", { name: "Confirm import (2)" }).click();
  await expect(page.getByRole("status")).toContainText("2 containers imported from CSV.");
});

test("administrator can search, create, and update managed users", async ({ page }) => {
  const api = await installApiMocks(page, "ADMIN");
  await signIn(page, "ADMIN");

  await expect(page.getByRole("button", { name: "Users", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Users", exact: true }).click();
  await expect(page.getByRole("heading", { name: "User management" })).toBeVisible();

  await page.getByLabel("Search users").fill("gate@portflow.test");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Demo Gate Operator")).toBeVisible();
  await expect(page.getByText("admin@portflow.test")).toHaveCount(0);

  await page.getByText("Create a user").click();
  await page.getByLabel("Full name").fill("Demo Yard Operator");
  await page.getByLabel("Email address").fill("yard@portflow.test");
  await page.getByLabel("Temporary password").fill("FictionalDemoPassword#2");
  await page.getByLabel("Role").first().selectOption("YARD_OPERATOR");
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByRole("status")).toContainText("Demo Yard Operator was created");
  await expect(page.getByText("yard@portflow.test")).toBeVisible();

  const gateRow = page.getByRole("row").filter({ hasText: "gate@portflow.test" });
  await gateRow.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Role").last().selectOption("YARD_OPERATOR");
  await page.getByLabel("Account active").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("status")).toContainText("Demo Gate Operator's account was updated");
  const updatedGateRow = page.getByRole("row").filter({ hasText: "gate@portflow.test" });
  await expect(updatedGateRow.getByText("YARD OPERATOR")).toBeVisible();
  await expect(updatedGateRow.getByText("Inactive")).toBeVisible();
  expect(api.getUsers().find((user) => user.id === "demo-gate")).toMatchObject({
    role: "YARD_OPERATOR",
    isActive: false
  });
  await updatedGateRow.getByRole("button", { name: "Edit" }).click();
  await page.locator("form").filter({ hasText: "Edit user" })
    .getByLabel("Temporary password", { exact: true })
    .fill("FictionalResetPassword#3");
  await page.getByRole("button", { name: "Set temporary password and sign out sessions" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Demo Gate Operator's temporary password was set; existing sessions were signed out and the user must change it at next sign-in."
  );

  const userFilters = page.locator("form").filter({ has: page.getByLabel("Search users") });
  await page.getByLabel("Search users").fill("yard@portflow.test");
  await userFilters.locator("select").nth(0).selectOption("YARD_OPERATOR");
  await userFilters.locator("select").nth(1).selectOption("active");
  await userFilters.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("yard@portflow.test")).toBeVisible();
  const userDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await userDownloadPromise).suggestedFilename()).toBe("portflow-managed-users.csv");
  await expect.poll(() => api.getUserExportFilters()).toEqual({
    search: "yard@portflow.test",
    role: "YARD_OPERATOR",
    isActive: "true"
  });
});

test("user must change an administrator-set password before continuing", async ({ page }) => {
  await installApiMocks(page, "GATE_OPERATOR", true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  await page.getByLabel("Email address").fill("gate@portflow.test");
  await page.getByLabel("Password").fill("FictionalDemoPassword#1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toHaveCount(0);

  await page.getByLabel("New password", { exact: true }).fill("FictionalPermanentPassword#4");
  await page.getByLabel("Confirm new password").fill("FictionalPermanentPassword#4");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Password updated. Sign in with your new password."
  );
  await page.getByLabel("Email address").fill("gate@portflow.test");
  await page.getByLabel("Password").fill("FictionalPermanentPassword#4");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
});

test("administrator can update yard capacity and availability", async ({ page }) => {
  const api = await installApiMocks(page, "ADMIN");
  await signIn(page, "ADMIN");
  await page.getByRole("button", { name: "Yards", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Yard management" })).toBeVisible();
  const exportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export occupancy CSV" }).click();
  expect((await exportPromise).suggestedFilename()).toBe("portflow-yard-occupancy.csv");

  const firstYard = page.locator("form").filter({ has: page.getByLabel("Capacity A-01") });
  await page.getByLabel("Capacity A-01").fill("15");
  await firstYard.getByRole("button", { name: "Save yard settings" }).click();
  await expect(page.getByRole("status")).toContainText("A-01 yard settings were updated.");

  const secondYard = page.locator("form").filter({ has: page.getByLabel("Active B-01") });
  await page.getByLabel("Active B-01").uncheck();
  await secondYard.getByRole("button", { name: "Save yard settings" }).click();
  await expect(page.getByRole("status")).toContainText("B-01 yard settings were updated.");

  expect(api.getYards()).toMatchObject([
    { code: "A-01", capacity: 15, isActive: true },
    { code: "B-01", capacity: 12, isActive: false }
  ]);
});

test("gate operator can filter gate transaction history", async ({ page }) => {
  await installApiMocks(page, "GATE_OPERATOR");
  await signIn(page, "GATE_OPERATOR");

  await page.getByRole("button", { name: "Gate history", exact: true }).click();
  await expect(page.getByRole("heading", {
    level: 1,
    name: "Gate transaction history"
  })).toBeVisible();
  await expect(page.getByRole("button", { name: "Users", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Yards", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Audit log", exact: true })).toHaveCount(0);

  await page.getByLabel("Search gate transactions").fill("demo driver two");
  await page.getByLabel("Gate direction").selectOption("OUT");
  await page.getByLabel("Gate history from date").fill("2026-02-02");
  await page.getByLabel("Gate history to date").fill("2026-02-02");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page.getByText("XY-9876")).toBeVisible();
  await expect(page.getByText("Demo Driver Two")).toBeVisible();
  await expect(page.getByText("AB-1234")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("portflow-gate-history.csv");
});

test("administrator can search and filter the audit log", async ({ page }) => {
  await installApiMocks(page, "ADMIN");
  await signIn(page, "ADMIN");
  await page.getByRole("button", { name: "Audit log", exact: true }).click();
  await expect(page.getByRole("heading", {
    level: 1,
    name: "Administrative audit log"
  })).toBeVisible();

  await page.getByLabel("Search audit log").fill("demo-container");
  await page.getByLabel("Audit entity type").selectOption("CONTAINER");
  await page.getByLabel("Audit action").selectOption("CONTAINER_REGISTERED");
  await page.getByLabel("Audit log from date").fill("2026-02-01");
  await page.getByLabel("Audit log to date").fill("2026-02-01");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  const entry = page.getByRole("row").filter({ hasText: "demo-container" });
  await expect(entry.getByText("CONTAINER REGISTERED")).toBeVisible();
  await entry.getByText("View changes").click();
  await expect(entry.getByText(/CSQU3054383/)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "demo-gate" })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("portflow-audit-log.csv");
});
