import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  changeOwnPassword,
  exportDashboardActivity,
  getDashboardSummary,
  login,
  logout,
  refreshSessionOnce,
  saveCsvDownload,
  withSessionRefresh
} from "./dashboard-api.js";
import type {
  ContainerStatus,
  DashboardDateRange,
  DashboardSummary,
  UserSession
} from "./dashboard-api.js";
import ContainerOperations from "./ContainerOperations.js";
import AdminUsers from "./AdminUsers.js";
import AdminYards from "./AdminYards.js";
import GateHistory from "./GateHistory.js";
import AdminAuditLog from "./AdminAuditLog.js";

const statusOrder: ContainerStatus[] = [
  "REGISTERED",
  "IN_YARD",
  "STORED",
  "GATE_OUT",
  "COMPLETED"
];

const statusLabels: Record<ContainerStatus, string> = {
  REGISTERED: "Registered",
  IN_YARD: "In yard",
  STORED: "Stored",
  GATE_OUT: "Gate out",
  COMPLETED: "Completed"
};

const statusColors: Record<ContainerStatus, string> = {
  REGISTERED: "bg-slate-400",
  IN_YARD: "bg-sky-500",
  STORED: "bg-emerald-500",
  GATE_OUT: "bg-amber-500",
  COMPLETED: "bg-violet-500"
};

function formatStatus(status: ContainerStatus | null): string {
  return status ? statusLabels[status] : "New";
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatActivityDateRange(dateRange: DashboardDateRange): string {
  if (dateRange.from && dateRange.to) {
    return `UTC ${dateRange.from} – ${dateRange.to}`;
  }
  if (dateRange.from) {
    return `UTC from ${dateRange.from}`;
  }
  if (dateRange.to) {
    return `UTC through ${dateRange.to}`;
  }
  return "UTC today";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

async function loadSummaryWithRefresh(
  accessToken: string,
  dateRange: DashboardDateRange
): Promise<{
  summary: DashboardSummary | null;
  refreshedSession: UserSession | null;
}> {
  try {
    return {
      summary: await getDashboardSummary(accessToken, dateRange),
      refreshedSession: null
    };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    const refreshedSession = await refreshSessionOnce();
    if (!refreshedSession) {
      return { summary: null, refreshedSession: null };
    }

    return {
      summary: await getDashboardSummary(refreshedSession.accessToken, dateRange),
      refreshedSession
    };
  }
}

function LoginScreen({
  onLogin,
  notice,
  successNotice
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  notice: string;
  successNotice: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await onLogin(email, password);
    } catch (loginError) {
      setError(getErrorMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-5 py-10 text-slate-950">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.35)] md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-[#10283d] p-12 text-white md:flex">
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -right-5 -top-5 h-52 w-52 rounded-full border border-white/10" />
          <div className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-cyan-400/10 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-400 text-lg font-black text-[#10283d]">
              P
            </div>
            <span className="text-xl font-bold tracking-tight">Portflow</span>
          </div>
          <div className="relative max-w-md">
            <p className="text-xs font-bold tracking-[0.24em] text-cyan-300 uppercase">
              Container terminal operations
            </p>
            <h1 className="mt-5 text-5xl leading-[1.08] font-semibold tracking-tight">
              A clearer view of every move.
            </h1>
            <p className="mt-6 max-w-sm text-base leading-7 text-slate-300">
              Keep container activity, yard capacity, and gate operations in one operational view.
            </p>
          </div>
          <p className="relative text-xs text-slate-400">
            Independent portfolio project · Fictional demo data
          </p>
        </section>

        <section className="flex min-h-[620px] flex-col justify-center px-7 py-12 sm:px-12">
          <div className="mb-9 md:hidden">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#10283d] font-black text-cyan-300">
                P
              </div>
              <span className="text-xl font-bold">Portflow</span>
            </div>
          </div>
          <p className="text-sm font-semibold text-cyan-700">Welcome back</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Sign in to your workspace</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Use your Portflow account to open the operations dashboard.
          </p>

          <form className="mt-9 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Email address</span>
              <input
                autoComplete="username"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-500/10"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
              <input
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-500/10"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
                {error}
              </p>
            )}
            {notice && !error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
                {notice}
              </p>
            )}
            {successNotice && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
                {successNotice}
              </p>
            )}
            <button
              className="w-full rounded-xl bg-[#10283d] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-[#183b56] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="mt-8 text-xs leading-5 text-slate-400">
            Sign-in is secured with an HttpOnly refresh cookie and CSRF protection.
          </p>
        </section>
      </div>
    </main>
  );
}

function PasswordChangeScreen({
  session,
  onSessionRefresh,
  onComplete
}: {
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
  onComplete: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 12 || password.length > 128) {
      setError("Password must contain between 12 and 128 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The password confirmation does not match.");
      return;
    }

    setSubmitting(true);
    try {
      await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        changeOwnPassword(activeSession, password)
      );
      onComplete();
    } catch (changeError) {
      setError(getErrorMessage(changeError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7fb] px-5 py-10 text-slate-950">
      <section className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl shadow-slate-900/10 sm:p-10">
        <p className="text-sm font-semibold text-cyan-700">One more step</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Change your password</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Your administrator provided a temporary password. Set a new password to continue.
        </p>
        <form className="mt-8 space-y-5" onSubmit={(event) => void submit(event)}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">New password</span>
            <input
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-500/10"
              maxLength={128}
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Confirm new password</span>
            <input
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-500/10"
              maxLength={128}
              minLength={12}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              type="password"
              value={confirmation}
            />
          </label>
          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {error}
            </p>
          )}
          <p className="text-xs leading-5 text-slate-400">
            Your password must be at least 12 characters. You will sign in again after changing it.
          </p>
          <button
            className="w-full rounded-xl bg-[#10283d] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#183b56] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Updating password..." : "Update password"}
          </button>
        </form>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
      <div className={`mb-5 h-1 w-10 rounded-full ${accent}`} />
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{detail}</p>
    </article>
  );
}

function GateActivityChart({
  days,
  dateLabel
}: {
  days: DashboardSummary["gateActivity"]["byDay"];
  dateLabel: string;
}) {
  const maxCount = Math.max(1, ...days.map((day) => Math.max(
    day.byDirection.IN,
    day.byDirection.OUT
  )));
  const chartWidth = Math.max(640, days.length * 64 + 48);
  const chartBottom = 150;
  const barHeight = (count: number) => count === 0 ? 0 : Math.max(2, (count / maxCount) * 118);

  return (
    <section
      aria-labelledby="daily-gate-activity-heading"
      className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight" id="daily-gate-activity-heading">
            Daily gate activity
          </h2>
          <p className="mt-1 text-sm text-slate-500">Transactions per UTC day · {dateLabel}</p>
        </div>
        <div aria-label="Gate direction legend" className="flex gap-4 text-xs font-medium text-slate-600">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-cyan-600" />
            Inbound
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-violet-500" />
            Outbound
          </span>
        </div>
      </div>
      {days.length > 0 ? (
        <>
          <div className="mt-5 overflow-x-auto">
            <svg
              aria-label="Daily gate transactions by direction"
              className="max-w-none"
              height="190"
              role="img"
              viewBox={`0 0 ${chartWidth} 190`}
              width={chartWidth}
            >
              <line
                stroke="#cbd5e1"
                strokeWidth="1"
                x1="24"
                x2={chartWidth - 24}
                y1={chartBottom}
                y2={chartBottom}
              />
              {days.map((day, index) => {
                const center = index * 64 + 44;
                const inboundHeight = barHeight(day.byDirection.IN);
                const outboundHeight = barHeight(day.byDirection.OUT);

                return (
                  <g key={day.date}>
                    <title>
                      {day.date}: {day.byDirection.IN} inbound, {day.byDirection.OUT} outbound
                    </title>
                    <rect
                      className="fill-cyan-600"
                      height={inboundHeight}
                      rx="3"
                      width="18"
                      x={center - 20}
                      y={chartBottom - inboundHeight}
                    />
                    <rect
                      className="fill-violet-500"
                      height={outboundHeight}
                      rx="3"
                      width="18"
                      x={center + 2}
                      y={chartBottom - outboundHeight}
                    />
                    <text
                      fill="#64748b"
                      fontSize="10"
                      textAnchor="middle"
                      x={center}
                      y="174"
                    >
                      {day.date.slice(5)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <table className="sr-only">
            <caption>Daily gate transactions by UTC date</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Inbound</th>
                <th scope="col">Outbound</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{day.date}</th>
                  <td>{day.byDirection.IN}</td>
                  <td>{day.byDirection.OUT}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="mt-5 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No gate transactions were recorded in this period.
        </p>
      )}
    </section>
  );
}

function Dashboard({
  session,
  summary,
  dateRange,
  loading,
  error,
  onDateRangeChange,
  onRefresh,
  onSessionRefresh,
  onLogout
}: {
  session: UserSession;
  summary: DashboardSummary | null;
  dateRange: DashboardDateRange;
  loading: boolean;
  error: string;
  onDateRangeChange: (dateRange: DashboardDateRange) => void;
  onRefresh: () => void;
  onSessionRefresh: (session: UserSession) => void;
  onLogout: () => void;
}) {
  const [activeView, setActiveView] = useState<
    "overview" | "containers" | "users" | "yards" | "gate" | "audit"
  >("overview");
  const [dateRangeDraft, setDateRangeDraft] = useState<DashboardDateRange>(dateRange);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const total = summary?.containerCounts.total ?? 0;
  const storedCount = summary?.containerCounts.byStatus.STORED ?? 0;
  const utilization = summary?.yardCapacity.utilizationPercent ?? 0;
  const gateActivity = summary?.gateActivity.byDirection;
  const dateLabel = formatActivityDateRange(dateRange);
  const hasDateRange = Boolean(dateRange.from || dateRange.to);
  const isDateRangeReversed = Boolean(
    dateRangeDraft.from && dateRangeDraft.to && dateRangeDraft.from > dateRangeDraft.to
  );

  function renderYardLocation(yard: DashboardSummary["yardCapacity"]["locations"][number]) {
    const yardUtilization = Math.round((yard.occupied / yard.capacity) * 100);
    const isFull = yard.occupied >= yard.capacity;

    return (
      <div className="flex items-center gap-3" key={yard.id}>
        <div className="grid h-9 w-10 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
          {yard.code}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-slate-600">Zone {yard.zone}</span>
            <span className="flex items-center gap-2">
              {isFull && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  Full
                </span>
              )}
              <span className={`tabular-nums ${isFull ? "font-semibold text-rose-700" : "text-slate-500"}`}>
                {yard.occupied}/{yard.capacity}
              </span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${isFull ? "bg-rose-500" : "bg-slate-500"}`}
              style={{ width: `${yardUtilization}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  async function exportDashboardCsv(): Promise<void> {
    setExportError("");
    setExporting(true);
    try {
      const blob = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        exportDashboardActivity(activeSession.accessToken, dateRange)
      );
      saveCsvDownload(blob, "portflow-dashboard-activity.csv");
    } catch (exportError) {
      setExportError(getErrorMessage(exportError));
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#10283d] font-black text-cyan-300">
              P
            </div>
            <div>
              <p className="text-lg leading-5 font-bold tracking-tight">Portflow</p>
              <p className="mt-1 text-[10px] font-bold tracking-[0.16em] text-slate-400 uppercase">
                {activeView === "users" || activeView === "yards" || activeView === "audit"
                  ? "Administration"
                  : activeView === "gate"
                    ? "Gate operations"
                    : "Operations overview"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-700">{session.user.name}</p>
              <p className="mt-0.5 text-xs text-slate-400">{session.user.role.replace("_", " ")}</p>
            </div>
            <button
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={onLogout}
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10">
        <nav aria-label="Main navigation" className="mb-8 flex gap-2 border-b border-slate-200">
          <button
            aria-current={activeView === "overview" ? "page" : undefined}
            className={`border-b-2 px-4 pb-3 text-sm font-semibold transition ${
              activeView === "overview"
                ? "border-cyan-600 text-cyan-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setActiveView("overview")}
            type="button"
          >
            Overview
          </button>
          <button
            aria-current={activeView === "containers" ? "page" : undefined}
            className={`border-b-2 px-4 pb-3 text-sm font-semibold transition ${
              activeView === "containers"
                ? "border-cyan-600 text-cyan-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setActiveView("containers")}
            type="button"
          >
            Containers
          </button>
          {(session.user.role === "ADMIN" || session.user.role === "GATE_OPERATOR") && (
            <button
              aria-current={activeView === "gate" ? "page" : undefined}
              className={`border-b-2 px-4 pb-3 text-sm font-semibold transition ${
                activeView === "gate"
                  ? "border-cyan-600 text-cyan-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
              onClick={() => setActiveView("gate")}
              type="button"
            >
              Gate history
            </button>
          )}
          {session.user.role === "ADMIN" && (
            <>
              <button
                aria-current={activeView === "users" ? "page" : undefined}
                className={`border-b-2 px-4 pb-3 text-sm font-semibold transition ${
                  activeView === "users"
                    ? "border-cyan-600 text-cyan-800"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => setActiveView("users")}
                type="button"
              >
                Users
              </button>
              <button
                aria-current={activeView === "yards" ? "page" : undefined}
                className={`border-b-2 px-4 pb-3 text-sm font-semibold transition ${
                  activeView === "yards"
                    ? "border-cyan-600 text-cyan-800"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => setActiveView("yards")}
                type="button"
              >
                Yards
              </button>
              <button
                aria-current={activeView === "audit" ? "page" : undefined}
                className={`border-b-2 px-4 pb-3 text-sm font-semibold transition ${
                  activeView === "audit"
                    ? "border-cyan-600 text-cyan-800"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => setActiveView("audit")}
                type="button"
              >
                Audit log
              </button>
            </>
          )}
        </nav>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-cyan-700">Terminal pulse</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {activeView === "overview"
                ? "Operations dashboard"
                : activeView === "containers"
                  ? "Container operations"
                  : activeView === "gate"
                    ? "Gate transaction history"
                      : activeView === "audit"
                        ? "Administrative audit log"
                    : activeView === "users"
                    ? "User management"
                    : "Yard management"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {activeView === "overview"
                ? "A live snapshot of container flow, yard capacity, and gate activity."
                : activeView === "containers"
                  ? "Search containers, review history, and perform authorized operations."
                  : activeView === "gate"
                    ? "Search and review gate-in and gate-out transactions."
                      : activeView === "audit"
                        ? "Review audited changes across users, containers, yards, and gate operations."
                    : activeView === "users"
                    ? "Create accounts, adjust roles, and manage active user access."
                    : "Adjust yard capacity and availability without exceeding current occupancy."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {activeView === "overview" && summary && (
              <p className="hidden text-xs text-slate-400 lg:block">
                Updated {formatTimestamp(summary.generatedAt)}
              </p>
            )}
            {activeView === "overview" && (
              <button
                className="rounded-xl border border-cyan-200 px-4 py-2.5 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-50 disabled:opacity-60"
                disabled={exporting}
                onClick={() => void exportDashboardCsv()}
                type="button"
              >
                {exporting ? "Exporting..." : "Export CSV"}
              </button>
            )}
            {activeView === "overview" && (
              <button
                className="rounded-xl bg-[#10283d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183b56] disabled:opacity-60"
                disabled={loading}
                onClick={onRefresh}
                type="button"
              >
                {loading ? "Updating..." : "Refresh"}
              </button>
            )}
          </div>
        </div>

        {activeView === "overview" && error && (
          <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}
        {activeView === "overview" && exportError && (
          <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            {exportError}
          </p>
        )}

        {activeView === "overview" && (
          <form
            className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!isDateRangeReversed) {
                onDateRangeChange(dateRangeDraft);
              }
            }}
          >
            <div className="mr-auto">
              <p className="text-sm font-semibold text-slate-800">Activity date range (UTC)</p>
              <p className="mt-1 text-xs text-slate-500">
                Filter gate transactions and movements. Without dates, gate counts show today and movements show the latest 8 overall.
              </p>
            </div>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              From
              <input
                aria-label="Activity from date (UTC)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                max={dateRangeDraft.to}
                onChange={(event) =>
                  setDateRangeDraft((current) => ({ ...current, from: event.target.value }))
                }
                type="date"
                value={dateRangeDraft.from ?? ""}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              To
              <input
                aria-label="Activity to date (UTC)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                min={dateRangeDraft.from}
                onChange={(event) =>
                  setDateRangeDraft((current) => ({ ...current, to: event.target.value }))
                }
                type="date"
                value={dateRangeDraft.to ?? ""}
              />
            </label>
            {isDateRangeReversed && (
              <p className="basis-full text-sm text-rose-700" role="alert">
                The end date must be on or after the start date.
              </p>
            )}
            <button
              className="rounded-xl bg-[#10283d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183b56] disabled:opacity-60"
              disabled={isDateRangeReversed || loading}
              type="submit"
            >
              Apply range
            </button>
            <button
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => {
                setDateRangeDraft({});
                onDateRangeChange({});
              }}
              type="button"
            >
              Clear dates
            </button>
          </form>
        )}

        {activeView === "gate" ? (
          <GateHistory onSessionRefresh={onSessionRefresh} session={session} />
        ) : activeView === "audit" ? (
          <AdminAuditLog onSessionRefresh={onSessionRefresh} session={session} />
        ) : activeView === "users" ? (
          <AdminUsers onSessionRefresh={onSessionRefresh} session={session} />
        ) : activeView === "yards" ? (
          <AdminYards
            onMutation={onRefresh}
            onSessionRefresh={onSessionRefresh}
            session={session}
          />
        ) : activeView === "containers" ? (
          <ContainerOperations
            onMutation={onRefresh}
            onSessionRefresh={onSessionRefresh}
            session={session}
          />
        ) : !summary && loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            Loading operational data...
          </div>
        ) : summary ? (
          <>
            <section aria-label="Operational metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                accent="bg-cyan-500"
                detail={`${summary.containerCounts.byStatus.REGISTERED} awaiting gate-in`}
                label="Total containers"
                value={total.toLocaleString()}
              />
              <MetricCard
                accent="bg-emerald-500"
                detail="Currently assigned to active yard locations"
                label="Containers stored"
                value={storedCount.toLocaleString()}
              />
              <MetricCard
                accent="bg-violet-500"
                detail={`${summary.yardCapacity.available.toLocaleString()} spaces available`}
                label="Yard utilization"
                value={`${utilization}%`}
              />
              <MetricCard
                accent="bg-amber-500"
                detail={`Inbound and outbound · ${dateLabel}`}
                label="Gate transactions"
                value={((gateActivity?.IN ?? 0) + (gateActivity?.OUT ?? 0)).toLocaleString()}
              />
            </section>

            <GateActivityChart dateLabel={dateLabel} days={summary.gateActivity.byDay} />

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">Container flow</h2>
                    <p className="mt-1 text-sm text-slate-500">Current inventory by operational status</p>
                  </div>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-500">
                    {total} total
                  </span>
                </div>
                <div className="mt-7 space-y-5">
                  {statusOrder.map((status) => {
                    const count = summary.containerCounts.byStatus[status];
                    const width = total === 0 ? 0 : (count / total) * 100;

                    return (
                      <div key={status}>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-600">{statusLabels[status]}</span>
                          <span className="font-semibold tabular-nums text-slate-900">{count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${statusColors[status]}`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">Yard capacity</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {summary.yardCapacity.activeYards} active locations
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold tracking-tight">{utilization}%</p>
                    <p className="text-xs text-slate-400">used</p>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>{summary.yardCapacity.occupied} occupied</span>
                  <span>{summary.yardCapacity.capacity} total capacity</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all"
                    style={{ width: `${utilization}%` }}
                  />
                </div>
                <div className="mt-6 space-y-3">
                  {summary.yardCapacity.locations.length > 0 ? (
                    <>
                      {summary.yardCapacity.locations.slice(0, 5).map(renderYardLocation)}
                      {summary.yardCapacity.locations.length > 5 && (
                        <details className="rounded-lg bg-slate-50 px-3 py-2">
                          <summary className="cursor-pointer text-xs font-semibold text-cyan-800">
                            Show {summary.yardCapacity.locations.length - 5} more{" "}
                            {summary.yardCapacity.locations.length === 6 ? "location" : "locations"}
                          </summary>
                          <div className="mt-3 space-y-3">
                            {summary.yardCapacity.locations.slice(5).map(renderYardLocation)}
                          </div>
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      No active yard locations are configured.
                    </p>
                  )}
                </div>
                <p className="mt-4 text-xs text-slate-400">
                  Gate activity · {dateLabel}: {gateActivity?.IN ?? 0} in · {gateActivity?.OUT ?? 0} out
                </p>
              </article>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-5 sm:px-6">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Recent movements</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {hasDateRange
                      ? `Latest container events in ${dateLabel}`
                      : "Latest container events across the terminal"}
                  </p>
                </div>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-500">
                  {hasDateRange ? "Latest 8 in range" : "Latest 8"}
                </span>
              </div>
              {summary.recentMovements.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-slate-50/80 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                      <tr>
                        <th className="px-6 py-3.5">Container</th>
                        <th className="px-6 py-3.5">Movement</th>
                        <th className="px-6 py-3.5">Location</th>
                        <th className="px-6 py-3.5">Operator</th>
                        <th className="px-6 py-3.5">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.recentMovements.map((movement) => (
                        <tr className="transition hover:bg-slate-50/60" key={movement.id}>
                          <td className="whitespace-nowrap px-6 py-4 font-semibold text-slate-800">
                            {movement.containerNumber}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <span className="text-slate-500">{formatStatus(movement.previousStatus)}</span>
                            <span className="mx-2 text-slate-300">→</span>
                            <span className="font-semibold text-slate-800">
                              {statusLabels[movement.nextStatus]}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                            {movement.fromYardCode ?? "—"}
                            {movement.toYardCode && movement.toYardCode !== movement.fromYardCode
                              ? ` → ${movement.toYardCode}`
                              : ""}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                            {movement.actorName}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-400">
                            {formatTimestamp(movement.occurredAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-6 py-12 text-center text-sm text-slate-500">
                  No container movements have been recorded yet.
                </p>
              )}
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="font-semibold text-slate-700">Dashboard data is unavailable.</p>
            <p className="mt-2 text-sm text-slate-500">Refresh to try loading the operational summary again.</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [dateRange, setDateRange] = useState<DashboardDateRange>({});
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");

  useEffect(() => {
    let active = true;

    void refreshSessionOnce()
      .then((restoredSession) => {
        if (active) {
          setSession(restoredSession);
        }
      })
      .catch((restoreError: unknown) => {
        if (active) {
          setError(getErrorMessage(restoreError));
        }
      })
      .finally(() => {
        if (active) {
          setInitializing(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session || session.user.mustChangePassword) {
      setSummary(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    void loadSummaryWithRefresh(session.accessToken, dateRange)
      .then((result) => {
        if (!active) {
          return;
        }
        if (result.refreshedSession) {
          setSession(result.refreshedSession);
        }
        if (!result.summary) {
          setSession(null);
          return;
        }
        setSummary(result.summary);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session?.accessToken, dateRange.from, dateRange.to]);

  async function handleLogin(email: string, password: string): Promise<void> {
    setError("");
    setLoginNotice("");
    const nextSession = await login(email, password);
    setSession(nextSession);
  }

  function handlePasswordChangeComplete(): void {
    setSession(null);
    setSummary(null);
    setError("");
    setLoginNotice("Password updated. Sign in with your new password.");
  }

  async function handleLogout(): Promise<void> {
    if (!session) {
      return;
    }

    setError("");
    try {
      await logout(session.csrfToken);
      setSession(null);
      setSummary(null);
    } catch (logoutError) {
      setError(getErrorMessage(logoutError));
    }
  }

  function handleRefresh(): void {
    if (session) {
      setLoading(true);
      setError("");
      void loadSummaryWithRefresh(session.accessToken, dateRange)
        .then((result) => {
          if (result.refreshedSession) {
            setSession(result.refreshedSession);
          }
          if (!result.summary) {
            setSession(null);
            return;
          }
          setSummary(result.summary);
        })
        .catch((refreshError: unknown) => {
          setError(getErrorMessage(refreshError));
        })
        .finally(() => setLoading(false));
    }
  }

  if (initializing) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7fb] text-sm font-medium text-slate-500">
        Restoring secure session...
      </main>
    );
  }

  if (!session) {
    return <LoginScreen notice={error} onLogin={handleLogin} successNotice={loginNotice} />;
  }

  if (session.user.mustChangePassword) {
    return (
      <PasswordChangeScreen
        onComplete={handlePasswordChangeComplete}
        onSessionRefresh={setSession}
        session={session}
      />
    );
  }

  return (
    <Dashboard
      error={error}
      dateRange={dateRange}
      loading={loading}
      onDateRangeChange={setDateRange}
      onLogout={() => void handleLogout()}
      onRefresh={handleRefresh}
      onSessionRefresh={setSession}
      session={session}
      summary={summary}
    />
  );
}
