export type ContainerStatus =
  | "REGISTERED"
  | "IN_YARD"
  | "STORED"
  | "GATE_OUT"
  | "COMPLETED";

export interface DashboardSummary {
  generatedAt: string;
  containerCounts: {
    total: number;
    byStatus: Record<ContainerStatus, number>;
  };
  yardCapacity: {
    activeYards: number;
    capacity: number;
    occupied: number;
    available: number;
    utilizationPercent: number;
    locations: Array<{
      id: string;
      code: string;
      zone: string;
      occupied: number;
      capacity: number;
    }>;
  };
  gateActivity: {
    byDirection: { IN: number; OUT: number };
    byDay: Array<{
      date: string;
      byDirection: { IN: number; OUT: number };
    }>;
  };
  recentMovements: Array<{
    id: string;
    containerNumber: string;
    previousStatus: ContainerStatus | null;
    nextStatus: ContainerStatus;
    fromYardCode: string | null;
    toYardCode: string | null;
    description: string | null;
    occurredAt: string;
    actorName: string;
  }>;
}

export interface DashboardDateRange {
  from?: string;
  to?: string;
}

export interface UserSession {
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "GATE_OPERATOR" | "YARD_OPERATOR";
    mustChangePassword: boolean;
  };
  accessToken: string;
  csrfToken: string;
}

export type ContainerSize = "TWENTY_FT" | "FORTY_FT" | "FORTY_FIVE_FT";
export type ContainerType = "DRY" | "REEFER" | "OPEN_TOP" | "FLAT_RACK" | "TANK";
export type TradeType = "IMPORT" | "EXPORT";

export interface ContainerRecord {
  id: string;
  containerNumber: string;
  size: ContainerSize;
  type: ContainerType;
  tradeType: TradeType;
  status: ContainerStatus;
  currentYard: { id: string; code: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ContainerListResponse {
  data: ContainerRecord[];
  pagination: PageInfo;
}

export interface ContainerMovement {
  id: string;
  previousStatus: ContainerStatus | null;
  nextStatus: ContainerStatus;
  fromYard: { id: string; code: string } | null;
  toYard: { id: string; code: string } | null;
  description: string | null;
  occurredAt: string;
  actor: { id: string; name: string };
}

export interface MovementListResponse {
  data: ContainerMovement[];
  pagination: PageInfo;
}

export interface MovementDateFilters {
  from?: string;
  to?: string;
}

export interface ContainerListFilters {
  page: number;
  limit: number;
  search?: string;
  status?: ContainerStatus;
  size?: ContainerSize;
  type?: ContainerType;
  tradeType?: TradeType;
  yardCode?: string;
  from?: string;
  to?: string;
}

export interface RegisterContainerInput {
  containerNumber: string;
  size: ContainerSize;
  type: ContainerType;
  tradeType: TradeType;
}

export interface ContainerImportIssue {
  row: number;
  column: string;
  message: string;
}

export interface ContainerImportPreview {
  rowCount: number;
  sample: Array<{
    row: number;
    containerNumber: string;
    size: ContainerSize;
    type: ContainerType;
    tradeType: TradeType;
  }>;
}

export type UserRole = "ADMIN" | "GATE_OPERATOR" | "YARD_OPERATOR";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserListFilters {
  page: number;
  limit: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface CreateManagedUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateManagedUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface ManagedYard {
  id: string;
  code: string;
  zone: string;
  capacity: number;
  occupied: number;
  isActive: boolean;
}

export interface UpdateManagedYardInput {
  capacity?: number;
  isActive?: boolean;
}

export type GateDirection = "IN" | "OUT";

export interface GateTransactionRecord {
  id: string;
  direction: GateDirection;
  vehiclePlate: string;
  driverName: string;
  occurredAt: string;
  container: { id: string; containerNumber: string };
  operator: { id: string; name: string };
}

export interface GateTransactionFilters {
  page: number;
  limit: number;
  search?: string;
  direction?: GateDirection;
  from?: string;
  to?: string;
}

export interface GateTransactionListResponse {
  data: GateTransactionRecord[];
  pagination: PageInfo;
}

export type AuditJsonValue =
  | string
  | number
  | boolean
  | null
  | AuditJsonValue[]
  | { [key: string]: AuditJsonValue };

export type AuditEntityType = "CONTAINER" | "USER" | "YARD";

export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  actorEmail: string;
  actorName: string | null;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  oldValue: AuditJsonValue;
  newValue: AuditJsonValue;
  occurredAt: string;
}

export interface AuditLogFilters {
  page: number;
  limit: number;
  search?: string;
  entityType?: AuditEntityType;
  action?: string;
  from?: string;
  to?: string;
}

export interface AuditLogListResponse {
  data: AuditLogRecord[];
  pagination: PageInfo;
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getApiErrorBody(value: unknown): ApiErrorBody {
  if (!isRecord(value)) {
    return {};
  }
  const error = value.error;

  if (!isRecord(error)) {
    return {};
  }

  return {
    error: {
      ...(typeof error.code === "string" ? { code: error.code } : {}),
      ...(typeof error.message === "string" ? { message: error.message } : {}),
      ...(error.details !== undefined ? { details: error.details } : {})
    }
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers
  });
  const text = await response.text();
  let payload: unknown;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new Error("The API returned an invalid response.");
      }
      throw new ApiError(`Request failed with status ${response.status}.`, response.status);
    }
  }

  if (!response.ok) {
    const body = getApiErrorBody(payload);
    throw new ApiError(
      body?.error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      body?.error?.code,
      body?.error?.details
    );
  }

  return payload as T;
}

async function requestCsv(path: string, accessToken: string): Promise<Blob> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed with status ${response.status}.`;

    if (text) {
      try {
        const body = getApiErrorBody(JSON.parse(text));
        message = body.error?.message ?? message;
      } catch {
        message = `Request failed with status ${response.status}.`;
      }
    }

    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export function saveCsvDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function getCsrfToken(): Promise<string> {
  const result = await requestJson<{ csrfToken: string }>("/auth/csrf");
  return result.csrfToken;
}

export async function login(email: string, password: string): Promise<UserSession> {
  const csrfToken = await getCsrfToken();

  return requestJson<UserSession>("/auth/login", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken },
    body: JSON.stringify({ email, password })
  });
}

export async function changeOwnPassword(
  session: UserSession,
  password: string
): Promise<void> {
  await requestJson<{ passwordChanged: boolean }>("/auth/password/change", {
    method: "POST",
    headers: mutationHeaders(session),
    body: JSON.stringify({ password })
  });
}

export async function refreshSession(): Promise<UserSession | null> {
  const csrfToken = await getCsrfToken();

  try {
    return await requestJson<UserSession>("/auth/refresh", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken }
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

let refreshSessionPromise: Promise<UserSession | null> | null = null;

export function refreshSessionOnce(): Promise<UserSession | null> {
  if (!refreshSessionPromise) {
    refreshSessionPromise = refreshSession().finally(() => {
      refreshSessionPromise = null;
    });
  }
  return refreshSessionPromise;
}

export async function withSessionRefresh<T>(
  session: UserSession,
  onSessionRefresh: (session: UserSession) => void,
  operation: (session: UserSession) => Promise<T>
): Promise<T> {
  try {
    return await operation(session);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    const refreshedSession = await refreshSessionOnce();
    if (!refreshedSession) {
      throw error;
    }

    onSessionRefresh(refreshedSession);
    return operation(refreshedSession);
  }
}

export async function logout(csrfToken: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": csrfToken }
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed with status ${response.status}.`;

    if (text) {
      try {
        const body = getApiErrorBody(JSON.parse(text));
        message = body.error?.message ?? message;
      } catch {
        message = `Request failed with status ${response.status}.`;
      }
    }

    throw new ApiError(message, response.status);
  }
}

function dashboardDateRangeQuery(dateRange: DashboardDateRange): string {
  const query = new URLSearchParams();
  if (dateRange.from) query.set("from", dateRange.from);
  if (dateRange.to) query.set("to", dateRange.to);
  return query.toString();
}

export async function getDashboardSummary(
  accessToken: string,
  dateRange: DashboardDateRange
): Promise<DashboardSummary> {
  const queryString = dashboardDateRangeQuery(dateRange);
  const path = queryString ? `/dashboard/summary?${queryString}` : "/dashboard/summary";
  const result = await requestJson<{ summary: DashboardSummary }>(path, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return result.summary;
}

export async function exportDashboardActivity(
  accessToken: string,
  dateRange: DashboardDateRange
): Promise<Blob> {
  const queryString = dashboardDateRangeQuery(dateRange);
  const query = queryString ? `?${queryString}` : "";
  return requestCsv(`/dashboard/summary/export${query}`, accessToken);
}

export async function listContainers(
  accessToken: string,
  filters: ContainerListFilters
): Promise<ContainerListResponse> {
  const query = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit)
  });

  if (filters.search) query.set("search", filters.search);
  if (filters.status) query.set("status", filters.status);
  if (filters.size) query.set("size", filters.size);
  if (filters.type) query.set("type", filters.type);
  if (filters.tradeType) query.set("tradeType", filters.tradeType);
  if (filters.yardCode) query.set("yardCode", filters.yardCode);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);

  return requestJson<ContainerListResponse>(`/containers?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function exportContainers(
  accessToken: string,
  filters: Omit<ContainerListFilters, "page" | "limit">
): Promise<Blob> {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.status) query.set("status", filters.status);
  if (filters.size) query.set("size", filters.size);
  if (filters.type) query.set("type", filters.type);
  if (filters.tradeType) query.set("tradeType", filters.tradeType);
  if (filters.yardCode) query.set("yardCode", filters.yardCode);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const queryString = query.size > 0 ? `?${query}` : "";

  return requestCsv(`/containers/export${queryString}`, accessToken);
}

export async function getContainerDetails(
  accessToken: string,
  containerId: string
): Promise<ContainerRecord> {
  const result = await requestJson<{ container: ContainerRecord }>(
    `/containers/${encodeURIComponent(containerId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return result.container;
}

export async function getContainerMovements(
  accessToken: string,
  containerId: string,
  page = 1,
  limit = 10,
  dateFilters: MovementDateFilters = {}
): Promise<MovementListResponse> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (dateFilters.from) query.set("from", dateFilters.from);
  if (dateFilters.to) query.set("to", dateFilters.to);
  return requestJson<MovementListResponse>(
    `/containers/${encodeURIComponent(containerId)}/movements?${query}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export async function exportContainerMovements(
  accessToken: string,
  containerId: string,
  dateFilters: MovementDateFilters = {}
): Promise<Blob> {
  const query = new URLSearchParams();
  if (dateFilters.from) query.set("from", dateFilters.from);
  if (dateFilters.to) query.set("to", dateFilters.to);
  const queryString = query.toString();
  const path = `/containers/${encodeURIComponent(containerId)}/movements/export${
    queryString ? `?${queryString}` : ""
  }`;
  return requestCsv(
    path,
    accessToken
  );
}

function mutationHeaders(session: UserSession): Record<string, string> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "X-CSRF-Token": session.csrfToken
  };
}

export async function registerContainer(
  session: UserSession,
  input: RegisterContainerInput
): Promise<ContainerRecord> {
  const result = await requestJson<{ container: ContainerRecord }>("/containers", {
    method: "POST",
    headers: mutationHeaders(session),
    body: JSON.stringify(input)
  });
  return result.container;
}

async function postContainerCsv<T>(
  session: UserSession,
  path: string,
  csv: string
): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: {
      ...mutationHeaders(session),
      "Content-Type": "text/csv"
    },
    body: csv
  });
}

export async function previewContainerImport(
  session: UserSession,
  csv: string
): Promise<ContainerImportPreview> {
  return postContainerCsv<ContainerImportPreview>(session, "/containers/import/preview", csv);
}

export async function importContainers(
  session: UserSession,
  csv: string
): Promise<{ importedCount: number }> {
  return postContainerCsv<{ importedCount: number }>(session, "/containers/import", csv);
}

export function downloadContainerImportTemplate(): void {
  const contents = "containerNumber,size,type,tradeType\r\n";
  saveCsvDownload(
    new Blob([contents], { type: "text/csv;charset=utf-8" }),
    "portflow-container-import-template.csv"
  );
}

export async function submitGateTransaction(
  session: UserSession,
  direction: "in" | "out",
  input: { containerId: string; vehiclePlate: string; driverName: string }
): Promise<void> {
  await requestJson<{ gateTransaction: unknown }>(`/gate/${direction}`, {
    method: "POST",
    headers: mutationHeaders(session),
    body: JSON.stringify(input)
  });
}

export async function submitYardAction(
  session: UserSession,
  action: "placement" | "relocation",
  input: { containerId: string; yardCode: string }
): Promise<void> {
  await requestJson<Record<string, unknown>>(`/yard/${action}`, {
    method: "POST",
    headers: mutationHeaders(session),
    body: JSON.stringify(input)
  });
}

export async function completeContainer(
  session: UserSession,
  containerId: string
): Promise<void> {
  await requestJson<{ completion: unknown }>(
    `/containers/${encodeURIComponent(containerId)}/complete`,
    {
      method: "POST",
      headers: mutationHeaders(session)
    }
  );
}

export async function listManagedUsers(
  accessToken: string,
  filters: UserListFilters
): Promise<{ data: ManagedUser[]; pagination: PageInfo }> {
  const query = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit)
  });

  if (filters.search) query.set("search", filters.search);
  if (filters.role) query.set("role", filters.role);
  if (filters.isActive !== undefined) query.set("isActive", String(filters.isActive));

  return requestJson<{ data: ManagedUser[]; pagination: PageInfo }>(`/users?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function exportManagedUsers(
  accessToken: string,
  filters: Pick<UserListFilters, "search" | "role" | "isActive">
): Promise<Blob> {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.role) query.set("role", filters.role);
  if (filters.isActive !== undefined) query.set("isActive", String(filters.isActive));
  const queryString = query.toString();

  return requestCsv(`/users/export${queryString ? `?${queryString}` : ""}`, accessToken);
}

export async function createManagedUser(
  session: UserSession,
  input: CreateManagedUserInput
): Promise<ManagedUser> {
  const result = await requestJson<{ user: ManagedUser }>("/users", {
    method: "POST",
    headers: mutationHeaders(session),
    body: JSON.stringify(input)
  });
  return result.user;
}

export async function updateManagedUser(
  session: UserSession,
  userId: string,
  input: UpdateManagedUserInput
): Promise<ManagedUser> {
  const result = await requestJson<{ user: ManagedUser }>(`/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: mutationHeaders(session),
    body: JSON.stringify(input)
  });
  return result.user;
}

export async function resetManagedUserPassword(
  session: UserSession,
  userId: string,
  password: string
): Promise<void> {
  await requestJson<{ reset: boolean }>(`/users/${encodeURIComponent(userId)}/password`, {
    method: "PATCH",
    headers: mutationHeaders(session),
    body: JSON.stringify({ password })
  });
}

export async function listManagedYards(accessToken: string): Promise<ManagedYard[]> {
  const result = await requestJson<{ data: ManagedYard[] }>("/yard", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return result.data;
}

export async function exportManagedYards(accessToken: string): Promise<Blob> {
  return requestCsv("/yard/export", accessToken);
}

export async function updateManagedYard(
  session: UserSession,
  yardId: string,
  input: UpdateManagedYardInput
): Promise<ManagedYard> {
  const result = await requestJson<{ yard: ManagedYard }>(
    `/yard/${encodeURIComponent(yardId)}`,
    {
      method: "PATCH",
      headers: mutationHeaders(session),
      body: JSON.stringify(input)
    }
  );
  return result.yard;
}

export async function listGateTransactions(
  accessToken: string,
  filters: GateTransactionFilters
): Promise<GateTransactionListResponse> {
  const query = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit)
  });

  if (filters.search) query.set("search", filters.search);
  if (filters.direction) query.set("direction", filters.direction);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);

  return requestJson<GateTransactionListResponse>(`/gate?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function exportGateTransactions(
  accessToken: string,
  filters: Omit<GateTransactionFilters, "page" | "limit">
): Promise<Blob> {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.direction) query.set("direction", filters.direction);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const queryString = query.size > 0 ? `?${query}` : "";

  return requestCsv(`/gate/export${queryString}`, accessToken);
}

export async function listAuditLogs(
  accessToken: string,
  filters: AuditLogFilters
): Promise<AuditLogListResponse> {
  const query = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit)
  });

  if (filters.search) query.set("search", filters.search);
  if (filters.entityType) query.set("entityType", filters.entityType);
  if (filters.action) query.set("action", filters.action);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);

  return requestJson<AuditLogListResponse>(`/audit?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function exportAuditLogs(
  accessToken: string,
  filters: Omit<AuditLogFilters, "page" | "limit">
): Promise<Blob> {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.entityType) query.set("entityType", filters.entityType);
  if (filters.action) query.set("action", filters.action);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const queryString = query.size > 0 ? `?${query}` : "";

  return requestCsv(`/audit/export${queryString}`, accessToken);
}
