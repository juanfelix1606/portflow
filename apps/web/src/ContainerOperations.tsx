import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  completeContainer,
  downloadContainerImportTemplate,
  exportContainerMovements,
  exportContainers,
  getContainerDetails,
  getContainerMovements,
  importContainers,
  listContainers,
  previewContainerImport,
  registerContainer,
  saveCsvDownload,
  submitGateTransaction,
  submitYardAction,
  withSessionRefresh
} from "./dashboard-api.js";
import type {
  ContainerImportIssue,
  ContainerImportPreview,
  ContainerListResponse,
  ContainerMovement,
  ContainerRecord,
  ContainerSize,
  ContainerStatus,
  ContainerType,
  MovementListResponse,
  TradeType,
  UserSession
} from "./dashboard-api.js";

type OperationAction = "gate-in" | "gate-out" | "placement" | "relocation" | "complete";

const containerStatuses: ContainerStatus[] = [
  "REGISTERED",
  "IN_YARD",
  "STORED",
  "GATE_OUT",
  "COMPLETED"
];
const containerSizes: ContainerSize[] = ["TWENTY_FT", "FORTY_FT", "FORTY_FIVE_FT"];
const containerTypes: ContainerType[] = ["DRY", "REEFER", "OPEN_TOP", "FLAT_RACK", "TANK"];
const tradeTypes: TradeType[] = ["IMPORT", "EXPORT"];

const statusLabels: Record<ContainerStatus, string> = {
  REGISTERED: "Registered",
  IN_YARD: "In yard",
  STORED: "Stored",
  GATE_OUT: "Gate out",
  COMPLETED: "Completed"
};

const statusStyles: Record<ContainerStatus, string> = {
  REGISTERED: "bg-slate-100 text-slate-700",
  IN_YARD: "bg-sky-50 text-sky-700",
  STORED: "bg-emerald-50 text-emerald-700",
  GATE_OUT: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-violet-50 text-violet-700"
};

function isGateOperator(session: UserSession): boolean {
  return session.user.role === "ADMIN" || session.user.role === "GATE_OPERATOR";
}

function isYardOperator(session: UserSession): boolean {
  return session.user.role === "ADMIN" || session.user.role === "YARD_OPERATOR";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed. Please try again.";
}

function getImportIssues(error: unknown): ContainerImportIssue[] {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) {
    return [];
  }

  return error.details.filter((issue): issue is ContainerImportIssue =>
    typeof issue === "object" &&
    issue !== null &&
    "row" in issue &&
    typeof issue.row === "number" &&
    "column" in issue &&
    typeof issue.column === "string" &&
    "message" in issue &&
    typeof issue.message === "string"
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function fieldClassName(): string {
  return "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
}

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-1.5 block text-xs font-semibold text-slate-600">{children}</span>;
}

function RegisterContainerForm({
  session,
  onSessionRefresh,
  onCreated
}: {
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
  onCreated: (container: ContainerRecord) => void;
}) {
  const [containerNumber, setContainerNumber] = useState("");
  const [size, setSize] = useState<ContainerSize>("FORTY_FT");
  const [type, setType] = useState<ContainerType>("DRY");
  const [tradeType, setTradeType] = useState<TradeType>("IMPORT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const container = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        registerContainer(activeSession, {
          containerNumber: containerNumber.trim().toUpperCase(),
          size,
          type,
          tradeType
        })
      );
      setContainerNumber("");
      onCreated(container);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4 sm:grid-cols-2 xl:grid-cols-5" onSubmit={(event) => void submit(event)}>
      <label className="sm:col-span-2 xl:col-span-1">
        <FieldLabel>Container number</FieldLabel>
        <input
          autoCapitalize="characters"
          className={fieldClassName()}
          maxLength={11}
          onChange={(event) => setContainerNumber(event.target.value)}
          pattern="[A-Za-z]{3}[UJZ][0-9]{7}"
          placeholder="CSQU3054383"
          required
          title="Use the ISO 6346 format; the server validates the check digit."
          value={containerNumber}
        />
      </label>
      <label>
        <FieldLabel>Size</FieldLabel>
        <select className={fieldClassName()} onChange={(event) => setSize(event.target.value as ContainerSize)} value={size}>
          {containerSizes.map((option) => (
            <option key={option} value={option}>{option.replace("_", " ")}</option>
          ))}
        </select>
      </label>
      <label>
        <FieldLabel>Type</FieldLabel>
        <select className={fieldClassName()} onChange={(event) => setType(event.target.value as ContainerType)} value={type}>
          {containerTypes.map((option) => (
            <option key={option} value={option}>{option.replace("_", " ")}</option>
          ))}
        </select>
      </label>
      <label>
        <FieldLabel>Trade</FieldLabel>
        <select className={fieldClassName()} onChange={(event) => setTradeType(event.target.value as TradeType)} value={tradeType}>
          {tradeTypes.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <div className="flex items-end sm:col-span-2 xl:col-span-1">
        <button
          className="w-full rounded-xl bg-[#10283d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183b56] disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Registering..." : "Register container"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-700 sm:col-span-2 xl:col-span-5" role="alert">{error}</p>}
    </form>
  );
}

function ImportContainersForm({
  session,
  onSessionRefresh,
  onImported
}: {
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
  onImported: (count: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ContainerImportPreview | null>(null);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<ContainerImportIssue[]>([]);

  async function previewFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a CSV file to import.");
      return;
    }

    setPreviewing(true);
    setPreview(null);
    setError("");
    setIssues([]);
    try {
      const csv = await file.text();
      const result = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        previewContainerImport(activeSession, csv)
      );
      setPreview(result);
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError));
      setIssues(getImportIssues(submitError));
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmImport() {
    if (!file || !preview) {
      return;
    }

    setImporting(true);
    setError("");
    setIssues([]);
    try {
      const csv = await file.text();
      const result = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        importContainers(activeSession, csv)
      );
      setFile(null);
      setFileInputKey((key) => key + 1);
      setPreview(null);
      onImported(result.importedCount);
    } catch (importError: unknown) {
      setError(getErrorMessage(importError));
      setIssues(getImportIssues(importError));
    } finally {
      setImporting(false);
    }
  }

  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_auto]"
      onSubmit={(event) => void previewFile(event)}
    >
      <div>
        <label>
          <FieldLabel>Container inventory CSV</FieldLabel>
          <input
            key={fileInputKey}
            accept=".csv,text/csv"
            className={fieldClassName()}
            disabled={previewing || importing}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setError("");
              setIssues([]);
            }}
            required
            type="file"
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            Required columns: containerNumber, size, type, tradeType. Maximum 500 rows.
          </span>
          <button
            className="text-xs font-semibold text-cyan-800 hover:text-cyan-950"
            onClick={downloadContainerImportTemplate}
            type="button"
          >
            Download CSV template
          </button>
        </div>
      </div>
      <div className="flex items-end">
        <button
          className="w-full rounded-xl bg-[#10283d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183b56] disabled:opacity-60"
          disabled={previewing || importing || !file}
          type="submit"
        >
          {previewing ? "Checking CSV..." : "Preview CSV"}
        </button>
      </div>
      {preview && (
        <div className="space-y-3 sm:col-span-2" role="status">
          <p className="text-sm font-semibold text-emerald-800">
            Preview passed: {preview.rowCount} container{preview.rowCount === 1 ? "" : "s"} ready to import.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Container</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2">Trade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {preview.sample.map((item) => (
                  <tr key={item.row}>
                    <td className="py-2 pr-3">{item.row}</td>
                    <td className="py-2 pr-3 font-semibold">{item.containerNumber}</td>
                    <td className="py-2 pr-3">{item.size}</td>
                    <td className="py-2 pr-3">{item.type}</td>
                    <td className="py-2">{item.tradeType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rowCount > preview.sample.length && (
            <p className="text-xs text-slate-500">
              Showing the first {preview.sample.length} rows; {preview.rowCount - preview.sample.length} more are ready.
            </p>
          )}
          <button
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
            disabled={importing || previewing}
            onClick={() => void confirmImport()}
            type="button"
          >
            {importing ? "Importing..." : `Confirm import (${preview.rowCount})`}
          </button>
        </div>
      )}
      {error && (
        <div className="text-sm text-rose-700 sm:col-span-2" role="alert">
          <p>{error}</p>
          {issues.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1">
              {issues.map((issue, index) => (
                <li key={`${issue.row}-${issue.column}-${index}`}>
                  Row {issue.row}{issue.column ? ` (${issue.column})` : ""}: {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

function ActionForm({
  action,
  container,
  session,
  onSessionRefresh,
  onCancel,
  onComplete
}: {
  action: OperationAction;
  container: ContainerRecord;
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
  onCancel: () => void;
  onComplete: (message: string) => void;
}) {
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [yardCode, setYardCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const labels: Record<OperationAction, string> = {
    "gate-in": "Record gate-in",
    "gate-out": "Record gate-out",
    placement: "Place in yard",
    relocation: "Relocate container",
    complete: "Complete lifecycle"
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (action === "gate-in" || action === "gate-out") {
        await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
          submitGateTransaction(activeSession, action === "gate-in" ? "in" : "out", {
            containerId: container.id,
            vehiclePlate,
            driverName
          })
        );
      } else if (action === "placement" || action === "relocation") {
        await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
          submitYardAction(activeSession, action, {
            containerId: container.id,
            yardCode: yardCode.trim().toUpperCase()
          })
        );
      } else {
        await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
          completeContainer(activeSession, container.id)
        );
      }

      onComplete(`${labels[action]} recorded for ${container.containerNumber}.`);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  const requiresGateDetails = action === "gate-in" || action === "gate-out";
  const requiresYardCode = action === "placement" || action === "relocation";

  return (
    <form className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={(event) => void submit(event)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{labels[action]}</p>
          <p className="mt-1 text-xs text-slate-500">{container.containerNumber}</p>
        </div>
        <button className="text-xs font-semibold text-slate-400 hover:text-slate-700" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
      {requiresGateDetails && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>
            <FieldLabel>Vehicle plate</FieldLabel>
            <input
              className={fieldClassName()}
              maxLength={20}
              onChange={(event) => setVehiclePlate(event.target.value)}
              placeholder="AB-1234"
              required
              value={vehiclePlate}
            />
          </label>
          <label>
            <FieldLabel>Driver name</FieldLabel>
            <input
              className={fieldClassName()}
              maxLength={120}
              onChange={(event) => setDriverName(event.target.value)}
              placeholder="Driver name"
              required
              value={driverName}
            />
          </label>
        </div>
      )}
      {requiresYardCode && (
        <label className="mt-4 block">
          <FieldLabel>Destination yard code</FieldLabel>
          <input
            autoCapitalize="characters"
            className={fieldClassName()}
            maxLength={40}
            onChange={(event) => setYardCode(event.target.value)}
            placeholder="A-01"
            required
            value={yardCode}
          />
        </label>
      )}
      {action === "complete" && (
        <p className="mt-4 text-sm leading-6 text-slate-600">
          This will finalize the container lifecycle and append a completion movement.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
      <button
        className="mt-4 w-full rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Saving..." : labels[action]}
      </button>
    </form>
  );
}

function ContainerDetail({
  container,
  movements,
  session,
  onSessionRefresh,
  movementPage,
  movementFrom,
  movementTo,
  onMovementDateRangeChange,
  onMovementPage,
  onAction
}: {
  container: ContainerRecord;
  movements: MovementListResponse | null;
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
  movementPage: number;
  movementFrom: string;
  movementTo: string;
  onMovementDateRangeChange: (from: string, to: string) => void;
  onMovementPage: (page: number) => void;
  onAction: (action: OperationAction) => void;
}) {
  const [exportingMovements, setExportingMovements] = useState(false);
  const [movementExportError, setMovementExportError] = useState("");
  const actions: Array<{ key: OperationAction; label: string; enabled: boolean }> = [
    { key: "gate-in", label: "Gate-in", enabled: container.status === "REGISTERED" && isGateOperator(session) },
    { key: "placement", label: "Place in yard", enabled: container.status === "IN_YARD" && isYardOperator(session) },
    { key: "relocation", label: "Relocate", enabled: container.status === "STORED" && isYardOperator(session) },
    { key: "gate-out", label: "Gate-out", enabled: container.status === "STORED" && isGateOperator(session) },
    { key: "complete", label: "Complete", enabled: container.status === "GATE_OUT" && isGateOperator(session) }
  ];
  const activeActions = actions.filter((action) => action.enabled);

  async function exportMovementHistory(): Promise<void> {
    setMovementExportError("");
    setExportingMovements(true);
    try {
      const blob = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        exportContainerMovements(activeSession.accessToken, container.id, {
          ...(movementFrom ? { from: movementFrom } : {}),
          ...(movementTo ? { to: movementTo } : {})
        })
      );
      saveCsvDownload(blob, `portflow-${container.containerNumber}-movements.csv`);
    } catch (exportError) {
      setMovementExportError(getErrorMessage(exportError));
    } finally {
      setExportingMovements(false);
    }
  }

  return (
    <div className="space-y-5">
      <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-slate-400 uppercase">Container details</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight">{container.containerNumber}</h2>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusStyles[container.status]}`}>
            {statusLabels[container.status]}
          </span>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 text-sm">
          <div><dt className="text-xs text-slate-400">Size</dt><dd className="mt-1 font-semibold text-slate-700">{container.size.replace("_", " ")}</dd></div>
          <div><dt className="text-xs text-slate-400">Type</dt><dd className="mt-1 font-semibold text-slate-700">{container.type.replace("_", " ")}</dd></div>
          <div><dt className="text-xs text-slate-400">Trade</dt><dd className="mt-1 font-semibold text-slate-700">{container.tradeType}</dd></div>
          <div><dt className="text-xs text-slate-400">Current yard</dt><dd className="mt-1 font-semibold text-slate-700">{container.currentYard?.code ?? "Not assigned"}</dd></div>
        </dl>
        {activeActions.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">Available actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeActions.map((action) => (
                <button
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800"
                  key={action.key}
                  onClick={() => onAction(action.key)}
                  type="button"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </article>

      <article className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-bold text-slate-800">Movement history</h3>
            <p className="mt-1 text-xs text-slate-500">
              Most recent events first · export includes all matching events
            </p>
          </div>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            From (UTC)
            <input
              aria-label="Movement from date (UTC)"
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-800"
              max={movementTo || undefined}
              onChange={(event) =>
                onMovementDateRangeChange(event.target.value, movementTo)
              }
              type="date"
              value={movementFrom}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            To (UTC)
            <input
              aria-label="Movement to date (UTC)"
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-800"
              min={movementFrom || undefined}
              onChange={(event) =>
                onMovementDateRangeChange(movementFrom, event.target.value)
              }
              type="date"
              value={movementTo}
            />
          </label>
          <button
            aria-label="Export movement history CSV"
            className="rounded-xl border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-50 disabled:opacity-60"
            disabled={exportingMovements}
            onClick={() => void exportMovementHistory()}
            type="button"
          >
            {exportingMovements ? "Exporting..." : "Export CSV"}
          </button>
        </div>
        {movementExportError && (
          <p className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700" role="alert">
            {movementExportError}
          </p>
        )}
        {movements && movements.data.length > 0 ? (
          <ol className="divide-y divide-slate-100">
            {movements.data.map((movement: ContainerMovement) => (
              <li className="px-5 py-4" key={movement.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-700">
                    {movement.previousStatus ? statusLabels[movement.previousStatus] : "New"}
                    <span className="mx-1.5 text-slate-300">→</span>
                    {statusLabels[movement.nextStatus]}
                  </p>
                  <time className="shrink-0 text-[11px] text-slate-400">{formatTime(movement.occurredAt)}</time>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  {movement.description ?? "Container movement"}
                  {(movement.fromYard || movement.toYard) &&
                    ` · ${movement.fromYard?.code ?? "—"} → ${movement.toYard?.code ?? "—"}`}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">By {movement.actor.name}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            {movements
              ? movementFrom || movementTo
                ? "No movements match these dates."
                : "No movement history is available."
              : "Loading movement history..."}
          </p>
        )}
        {movements && movements.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs">
            <button
              className="font-semibold text-slate-600 disabled:text-slate-300"
              disabled={movementPage <= 1}
              onClick={() => onMovementPage(movementPage - 1)}
              type="button"
            >
              Previous
            </button>
            <span className="text-slate-400">
              {movementPage} / {movements.pagination.totalPages}
            </span>
            <button
              className="font-semibold text-slate-600 disabled:text-slate-300"
              disabled={movementPage >= movements.pagination.totalPages}
              onClick={() => onMovementPage(movementPage + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        )}
      </article>
    </div>
  );
}

export default function ContainerOperations({
  session,
  onSessionRefresh,
  onMutation
}: {
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
  onMutation: () => void;
}) {
  const [list, setList] = useState<ContainerListResponse | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [yardCodeInput, setYardCodeInput] = useState("");
  const [yardCode, setYardCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<ContainerStatus | "">("");
  const [size, setSize] = useState<ContainerSize | "">("");
  const [containerType, setContainerType] = useState<ContainerType | "">("");
  const [tradeType, setTradeType] = useState<TradeType | "">("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<ContainerRecord | null>(null);
  const [movements, setMovements] = useState<MovementListResponse | null>(null);
  const [movementPage, setMovementPage] = useState(1);
  const [movementFrom, setMovementFrom] = useState("");
  const [movementTo, setMovementTo] = useState("");
  const [action, setAction] = useState<OperationAction | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoadingList(true);
    setError("");

    void withSessionRefresh(session, onSessionRefresh, (activeSession) =>
      listContainers(activeSession.accessToken, {
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(yardCode ? { yardCode } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(status ? { status } : {}),
        ...(size ? { size } : {}),
        ...(containerType ? { type: containerType } : {}),
        ...(tradeType ? { tradeType } : {})
      })
    )
      .then((result) => {
        if (active) {
          setList(result);
          if (selectedId && !result.data.some((container) => container.id === selectedId)) {
            setSelectedId(null);
            setSelectedContainer(null);
            setMovements(null);
            setMovementFrom("");
            setMovementTo("");
            setMovementPage(1);
          }
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoadingList(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session.accessToken, onSessionRefresh, page, search, yardCode, from, to, status, size, containerType, tradeType, reloadKey]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedContainer(null);
      setMovements(null);
      return;
    }

    let active = true;
    setError("");
    void Promise.all([
      withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        getContainerDetails(activeSession.accessToken, selectedId)
      ),
      withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        getContainerMovements(activeSession.accessToken, selectedId, movementPage, 10, {
          ...(movementFrom ? { from: movementFrom } : {}),
          ...(movementTo ? { to: movementTo } : {})
        })
      )
    ])
      .then(([container, movementList]) => {
        if (active) {
          setSelectedContainer(container);
          setMovements(movementList);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      });

    return () => {
      active = false;
    };
  }, [
    session.accessToken,
    onSessionRefresh,
    selectedId,
    movementPage,
    movementFrom,
    movementTo,
    reloadKey
  ]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
    setYardCode(yardCodeInput.trim().toUpperCase());
  }

  function refreshData() {
    setReloadKey((key) => key + 1);
  }

  async function exportInventory() {
    setExporting(true);
    setError("");

    try {
      const blob = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        exportContainers(activeSession.accessToken, {
          ...(search ? { search } : {}),
          ...(yardCode ? { yardCode } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(status ? { status } : {}),
          ...(size ? { size } : {}),
          ...(containerType ? { type: containerType } : {}),
          ...(tradeType ? { tradeType } : {})
        })
      );
      saveCsvDownload(blob, "portflow-container-inventory.csv");
    } catch (exportError: unknown) {
      setError(getErrorMessage(exportError));
    } finally {
      setExporting(false);
    }
  }

  function handleCreated(container: ContainerRecord) {
    setNotice(`Container ${container.containerNumber} registered.`);
    setSelectedId(container.id);
    setMovementPage(1);
    setMovementFrom("");
    setMovementTo("");
    refreshData();
    onMutation();
  }

  function handleMovementDateRangeChange(nextFrom: string, nextTo: string) {
    setMovementPage(1);
    setMovementFrom(nextFrom);
    setMovementTo(nextTo);
  }

  function handleImported(count: number) {
    setNotice(`${count} container${count === 1 ? "" : "s"} imported from CSV.`);
    refreshData();
    onMutation();
  }

  async function handleActionComplete(message: string) {
    setAction(null);
    setNotice(message);
    setMovementPage(1);
    refreshData();
    onMutation();
  }

  const isAdmin = session.user.role === "ADMIN";

  return (
    <section className="space-y-5">
      {isAdmin && (
        <details className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
          <summary className="cursor-pointer list-none text-sm font-bold text-slate-800 marker:hidden">
            <span className="flex items-center justify-between">
              Register a container
              <span className="text-xs font-semibold text-cyan-700 group-open:hidden">Open form +</span>
              <span className="hidden text-xs font-semibold text-slate-400 group-open:inline">Close −</span>
            </span>
          </summary>
          <div className="mt-4">
            <RegisterContainerForm
              onCreated={handleCreated}
              onSessionRefresh={onSessionRefresh}
              session={session}
            />
          </div>
        </details>
      )}

      {isAdmin && (
        <details className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
          <summary className="cursor-pointer list-none text-sm font-bold text-slate-800 marker:hidden">
            <span className="flex items-center justify-between">
              Import containers from CSV
              <span className="text-xs font-semibold text-cyan-700 group-open:hidden">Open form +</span>
              <span className="hidden text-xs font-semibold text-slate-400 group-open:inline">Close −</span>
            </span>
          </summary>
          <ImportContainersForm
            onImported={handleImported}
            onSessionRefresh={onSessionRefresh}
            session={session}
          />
        </details>
      )}

      <form className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_0.9fr_0.9fr_auto]" onSubmit={applySearch}>
        <label>
          <FieldLabel>Search by container number</FieldLabel>
          <input
            className={fieldClassName()}
            maxLength={11}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="e.g. CSQU3054383"
            value={searchInput}
          />
        </label>
        <label>
          <FieldLabel>Current yard code</FieldLabel>
          <input
            className={fieldClassName()}
            maxLength={40}
            onChange={(event) => setYardCodeInput(event.target.value)}
            placeholder="e.g. A-01"
            value={yardCodeInput}
          />
        </label>
        <label>
          <FieldLabel>Created from (UTC)</FieldLabel>
          <input
            aria-label="Container created from date (UTC)"
            className={fieldClassName()}
            max={to || undefined}
            onChange={(event) => {
              setPage(1);
              setFrom(event.target.value);
            }}
            type="date"
            value={from}
          />
        </label>
        <label>
          <FieldLabel>Created to (UTC)</FieldLabel>
          <input
            aria-label="Container created to date (UTC)"
            className={fieldClassName()}
            min={from || undefined}
            onChange={(event) => {
              setPage(1);
              setTo(event.target.value);
            }}
            type="date"
            value={to}
          />
        </label>
        <label>
          <FieldLabel>Status</FieldLabel>
          <select
            className={fieldClassName()}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as ContainerStatus | "");
            }}
            value={status}
          >
            <option value="">All statuses</option>
            {containerStatuses.map((option) => (
              <option key={option} value={option}>{statusLabels[option]}</option>
            ))}
          </select>
        </label>
        <label>
          <FieldLabel>Size</FieldLabel>
          <select
            className={fieldClassName()}
            onChange={(event) => {
              setPage(1);
              setSize(event.target.value as ContainerSize | "");
            }}
            value={size}
          >
            <option value="">All sizes</option>
            {containerSizes.map((option) => (
              <option key={option} value={option}>{option.replace("_", " ")}</option>
            ))}
          </select>
        </label>
        <label>
          <FieldLabel>Type</FieldLabel>
          <select
            className={fieldClassName()}
            onChange={(event) => {
              setPage(1);
              setContainerType(event.target.value as ContainerType | "");
            }}
            value={containerType}
          >
            <option value="">All types</option>
            {containerTypes.map((option) => (
              <option key={option} value={option}>{option.replace("_", " ")}</option>
            ))}
          </select>
        </label>
        <label>
          <FieldLabel>Trade</FieldLabel>
          <select
            className={fieldClassName()}
            onChange={(event) => {
              setPage(1);
              setTradeType(event.target.value as TradeType | "");
            }}
            value={tradeType}
          >
            <option value="">All trades</option>
            {tradeTypes.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            className="flex-1 rounded-xl bg-[#10283d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183b56]"
            type="submit"
          >
            Search
          </button>
          <button
            className="flex-1 rounded-xl border border-cyan-200 px-4 py-2.5 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-50 disabled:opacity-60"
            disabled={exporting}
            onClick={() => void exportInventory()}
            type="button"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </form>

      {notice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-800">Container register</h2>
              <p className="mt-1 text-xs text-slate-500">
                {list ? `${list.pagination.total} matching containers` : "Loading containers"}
              </p>
            </div>
            <button
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={loadingList}
              onClick={refreshData}
              type="button"
            >
              {loadingList ? "Loading..." : "Refresh"}
            </button>
          </div>
          {list && list.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-slate-50/80 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                  <tr>
                    <th className="px-5 py-3">Container</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Yard</th>
                    <th className="px-5 py-3">Trade</th>
                    <th className="px-5 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.map((container) => (
                    <tr className="hover:bg-slate-50/60" key={container.id}>
                      <td className="whitespace-nowrap px-5 py-3.5 font-semibold text-slate-800">{container.containerNumber}</td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyles[container.status]}`}>
                          {statusLabels[container.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">{container.currentYard?.code ?? "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">{container.tradeType}</td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <button
                          className="text-xs font-bold text-cyan-700 hover:text-cyan-900"
                          onClick={() => {
                            setSelectedId(container.id);
                            setMovementPage(1);
                            setMovementFrom("");
                            setMovementTo("");
                            setAction(null);
                          }}
                          type="button"
                        >
                          {selectedId === container.id ? "Selected" : "View"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              {loadingList ? "Loading containers..." : "No containers match these filters."}
            </p>
          )}
          {list && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs">
              <button
                className="font-semibold text-slate-600 disabled:text-slate-300"
                disabled={page <= 1 || loadingList}
                onClick={() => setPage((current) => current - 1)}
                type="button"
              >
                Previous
              </button>
              <span className="text-slate-400">
                Page {list.pagination.totalPages === 0 ? 0 : page} of {list.pagination.totalPages}
              </span>
              <button
                className="font-semibold text-slate-600 disabled:text-slate-300"
                disabled={page >= list.pagination.totalPages || loadingList}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          )}
        </article>

        <div className="space-y-4">
          {selectedContainer ? (
            <>
              <ContainerDetail
                container={selectedContainer}
                movementPage={movementPage}
                movementFrom={movementFrom}
                movementTo={movementTo}
                movements={movements}
                onAction={(nextAction) => setAction(nextAction)}
                onMovementDateRangeChange={handleMovementDateRangeChange}
                onMovementPage={setMovementPage}
                onSessionRefresh={onSessionRefresh}
                session={session}
              />
              {action && (
                <ActionForm
                  action={action}
                  container={selectedContainer}
                  onCancel={() => setAction(null)}
                  onComplete={(message) => void handleActionComplete(message)}
                  onSessionRefresh={onSessionRefresh}
                  session={session}
                />
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
              <p className="text-sm font-semibold text-slate-700">Select a container</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                View its operational history and available actions.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
