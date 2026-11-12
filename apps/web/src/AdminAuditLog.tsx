import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  exportAuditLogs,
  listAuditLogs,
  saveCsvDownload,
  withSessionRefresh
} from "./dashboard-api.js";
import type {
  AuditEntityType,
  AuditJsonValue,
  AuditLogRecord,
  UserSession
} from "./dashboard-api.js";

const pageSize = 20;
const entityTypes: AuditEntityType[] = ["CONTAINER", "USER", "YARD"];
const actions = [
  "CONTAINER_COMPLETED",
  "CONTAINER_PLACED",
  "CONTAINER_REGISTERED",
  "CONTAINER_RELOCATED",
  "GATE_IN_RECORDED",
  "GATE_OUT_RECORDED",
  "USER_CREATED",
  "USER_UPDATED",
  "YARD_UPDATED"
];
const fieldClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed. Please try again.";
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function displayValue(value: AuditJsonValue): string {
  if (value === null) return "—";
  return JSON.stringify(value, null, 2);
}

function AuditChanges({ entry }: { entry: AuditLogRecord }) {
  if (entry.oldValue === null && entry.newValue === null) {
    return <span className="text-xs text-slate-400">No field changes</span>;
  }

  return (
    <details className="max-w-[360px]">
      <summary className="cursor-pointer text-xs font-semibold text-cyan-700">
        View changes
      </summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase">Before</p>
          <pre className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-2 text-[10px] leading-4 text-slate-600">
            {displayValue(entry.oldValue)}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase">After</p>
          <pre className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-2 text-[10px] leading-4 text-slate-600">
            {displayValue(entry.newValue)}
          </pre>
        </div>
      </div>
    </details>
  );
}

export default function AdminAuditLog({
  session,
  onSessionRefresh
}: {
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
}) {
  const [entries, setEntries] = useState<AuditLogRecord[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: pageSize, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<AuditEntityType | "">("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    void withSessionRefresh(session, onSessionRefresh, (activeSession) =>
      listAuditLogs(activeSession.accessToken, {
        page,
        limit: pageSize,
        ...(search ? { search } : {}),
        ...(entityType ? { entityType } : {}),
        ...(action ? { action } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {})
      })
    )
      .then((result) => {
        if (active) {
          setEntries(result.data);
          setPagination(result.pagination);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session.accessToken, onSessionRefresh, page, search, entityType, action, from, to, reloadKey]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function exportCsv() {
    setError("");
    setExporting(true);
    try {
      const blob = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        exportAuditLogs(activeSession.accessToken, {
          ...(search ? { search } : {}),
          ...(entityType ? { entityType } : {}),
          ...(action ? { action } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {})
        })
      );
      saveCsvDownload(blob, "portflow-audit-log.csv");
    } catch (exportError) {
      setError(errorMessage(exportError));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-5">
      <form
        className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:grid-cols-2 xl:grid-cols-[1.3fr_0.8fr_1fr_0.8fr_0.8fr_auto]"
        onSubmit={applySearch}
      >
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Search audit log</span>
          <input
            aria-label="Search audit log"
            className={fieldClassName}
            maxLength={120}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Actor, action, entity, or ID"
            value={searchInput}
          />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Entity type</span>
          <select
            aria-label="Audit entity type"
            className={fieldClassName}
            onChange={(event) => {
              setPage(1);
              setEntityType(event.target.value as AuditEntityType | "");
            }}
            value={entityType}
          >
            <option value="">All entities</option>
            {entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Action</span>
          <select
            aria-label="Audit action"
            className={fieldClassName}
            onChange={(event) => {
              setPage(1);
              setAction(event.target.value);
            }}
            value={action}
          >
            <option value="">All actions</option>
            {actions.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">From date (UTC)</span>
          <input
            aria-label="Audit log from date"
            className={fieldClassName}
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
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">To date (UTC)</span>
          <input
            aria-label="Audit log to date"
            className={fieldClassName}
            min={from || undefined}
            onChange={(event) => {
              setPage(1);
              setTo(event.target.value);
            }}
            type="date"
            value={to}
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            className="w-full rounded-xl bg-[#10283d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183b56]"
            type="submit"
          >
            Search
          </button>
          <button
            aria-label="Refresh audit log"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            disabled={loading}
            onClick={() => setReloadKey((key) => key + 1)}
            type="button"
          >
            Refresh
          </button>
          <button
            className="rounded-xl border border-cyan-200 px-4 py-2.5 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-50 disabled:opacity-60"
            disabled={exporting}
            onClick={() => void exportCsv()}
            type="button"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}

      <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-800">Administrative audit log</h2>
            <p className="mt-1 text-xs text-slate-500">
              {loading ? "Loading audit entries..." : `${pagination.total} audit entries`}
            </p>
          </div>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-500">
            Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
          </span>
        </div>
        {entries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Entity</th>
                  <th className="px-5 py-3">Changes</th>
                  <th className="px-5 py-3">Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr className="align-top hover:bg-slate-50/60" key={entry.id}>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                        {entry.action.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-700">
                        {entry.actorName ?? "Former or removed user"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{entry.actorEmail}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-700">{entry.entityType}</p>
                      <p className="mt-1 text-xs text-slate-400">{entry.entityId}</p>
                    </td>
                    <td className="px-5 py-4"><AuditChanges entry={entry} /></td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                      {formatTimestamp(entry.occurredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading && !error ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No audit entries match these filters.
          </p>
        ) : null}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          <p className="text-xs text-slate-500">
            Showing {entries.length} of {pagination.total}
          </p>
          <div className="flex gap-2">
            <button
              aria-label="Previous audit page"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              aria-label="Next audit page"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={loading || page >= pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
