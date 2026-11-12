import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  exportGateTransactions,
  listGateTransactions,
  saveCsvDownload,
  withSessionRefresh
} from "./dashboard-api.js";
import type {
  GateDirection,
  GateTransactionRecord,
  UserSession
} from "./dashboard-api.js";

const pageSize = 20;
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

export default function GateHistory({
  session,
  onSessionRefresh
}: {
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
}) {
  const [transactions, setTransactions] = useState<GateTransactionRecord[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: pageSize, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<GateDirection | "">("");
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
      listGateTransactions(activeSession.accessToken, {
        page,
        limit: pageSize,
        ...(search ? { search } : {}),
        ...(direction ? { direction } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {})
      })
    )
      .then((result) => {
        if (active) {
          setTransactions(result.data);
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
  }, [session.accessToken, onSessionRefresh, page, search, direction, from, to, reloadKey]);

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
        exportGateTransactions(activeSession.accessToken, {
          ...(search ? { search } : {}),
          ...(direction ? { direction } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {})
        })
      );
      saveCsvDownload(blob, "portflow-gate-history.csv");
    } catch (exportError) {
      setError(errorMessage(exportError));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-5">
      <form
        className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:grid-cols-2 xl:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_auto]"
        onSubmit={applySearch}
      >
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Search transactions</span>
          <input
            aria-label="Search gate transactions"
            className={fieldClassName}
            maxLength={120}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Container, plate, driver, or operator"
            value={searchInput}
          />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Direction</span>
          <select
            aria-label="Gate direction"
            className={fieldClassName}
            onChange={(event) => {
              setPage(1);
              setDirection(event.target.value as GateDirection | "");
            }}
            value={direction}
          >
            <option value="">All directions</option>
            <option value="IN">Gate-in</option>
            <option value="OUT">Gate-out</option>
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">From date (UTC)</span>
          <input
            aria-label="Gate history from date"
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
            aria-label="Gate history to date"
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
            aria-label="Refresh gate transactions"
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
            <h2 className="font-bold text-slate-800">Gate transaction history</h2>
            <p className="mt-1 text-xs text-slate-500">
              {loading ? "Loading transactions..." : `${pagination.total} transactions`}
            </p>
          </div>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-500">
            Page {pagination.page} of {pagination.totalPages}
          </span>
        </div>
        {transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-5 py-3">Direction</th>
                  <th className="px-5 py-3">Container</th>
                  <th className="px-5 py-3">Vehicle / driver</th>
                  <th className="px-5 py-3">Operator</th>
                  <th className="px-5 py-3">Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((transaction) => (
                  <tr className="hover:bg-slate-50/60" key={transaction.id}>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        transaction.direction === "IN"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-amber-50 text-amber-700"
                      }`}>
                        {transaction.direction === "IN" ? "Gate-in" : "Gate-out"}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {transaction.container.containerNumber}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-700">{transaction.vehiclePlate}</p>
                      <p className="mt-1 text-xs text-slate-400">{transaction.driverName}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{transaction.operator.name}</td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {formatTimestamp(transaction.occurredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading && !error ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No gate transactions match these filters.
          </p>
        ) : null}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          <p className="text-xs text-slate-500">
            Showing {transactions.length} of {pagination.total}
          </p>
          <div className="flex gap-2">
            <button
              aria-label="Previous gate page"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              aria-label="Next gate page"
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
