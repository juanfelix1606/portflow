import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  exportManagedYards,
  listManagedYards,
  saveCsvDownload,
  updateManagedYard,
  withSessionRefresh
} from "./dashboard-api.js";
import type { ManagedYard, UpdateManagedYardInput, UserSession } from "./dashboard-api.js";

const fieldClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed. Please try again.";
}

function YardEditor({
  yard,
  session,
  onSessionRefresh,
  onSaved
}: {
  yard: ManagedYard;
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
  onSaved: (yard: ManagedYard) => void;
}) {
  const [capacity, setCapacity] = useState(String(yard.capacity));
  const [isActive, setIsActive] = useState(yard.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const nextCapacity = Number(capacity);
    if (!Number.isSafeInteger(nextCapacity) || nextCapacity < yard.occupied || nextCapacity < 1) {
      setError("Capacity must be a whole number at least equal to current occupancy.");
      return;
    }

    const input: UpdateManagedYardInput = {
      ...(nextCapacity !== yard.capacity ? { capacity: nextCapacity } : {}),
      ...(isActive !== yard.isActive ? { isActive } : {})
    };

    if (Object.keys(input).length === 0) {
      setError("No changes to save.");
      return;
    }

    setSaving(true);
    try {
      const updated = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        updateManagedYard(activeSession, yard.id, input)
      );
      setCapacity(String(updated.capacity));
      setIsActive(updated.isActive);
      onSaved(updated);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03]"
      onSubmit={(event) => void submit(event)}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-wide text-slate-400 uppercase">Zone {yard.zone}</p>
          <h2 className="mt-1 text-lg font-bold text-slate-800">{yard.code}</h2>
        </div>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
          {yard.occupied}/{yard.capacity} occupied
        </span>
      </div>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Capacity</span>
        <input
          aria-label={`Capacity ${yard.code}`}
          className={fieldClassName}
          max={2_147_483_647}
          min={Math.max(1, yard.occupied)}
          onChange={(event) => setCapacity(event.target.value)}
          required
          type="number"
          value={capacity}
        />
      </label>

      <label className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-3.5 py-3">
        <span>
          <span className="block text-sm font-semibold text-slate-700">Location active</span>
          <span className="mt-0.5 block text-xs text-slate-400">
            {yard.occupied > 0
              ? "Move all containers before deactivating this location."
              : "Inactive locations cannot receive placements."}
          </span>
        </span>
        <input
          aria-label={`Active ${yard.code}`}
          checked={isActive}
          disabled={yard.occupied > 0 && isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          type="checkbox"
        />
      </label>

      {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
      <button
        className="mt-5 w-full rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:opacity-60"
        disabled={saving}
        type="submit"
      >
        {saving ? "Saving..." : "Save yard settings"}
      </button>
    </form>
  );
}

export default function AdminYards({
  session,
  onSessionRefresh,
  onMutation
}: {
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
  onMutation: () => void;
}) {
  const [yards, setYards] = useState<ManagedYard[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    void withSessionRefresh(session, onSessionRefresh, (activeSession) =>
      listManagedYards(activeSession.accessToken)
    )
      .then((result) => {
        if (active) setYards(result);
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
  }, [session.accessToken, onSessionRefresh, reloadKey]);

  function handleSaved(yard: ManagedYard) {
    setYards((current) => current.map((item) => item.id === yard.id ? yard : item));
    setNotice(`${yard.code} yard settings were updated.`);
    onMutation();
  }

  async function exportYardOccupancy() {
    setError("");
    setExporting(true);
    try {
      const blob = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        exportManagedYards(activeSession.accessToken)
      );
      saveCsvDownload(blob, "portflow-yard-occupancy.csv");
    } catch (exportError) {
      setError(errorMessage(exportError));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-5">
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
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm shadow-slate-900/[0.03]">
        <div>
          <h2 className="font-bold text-slate-800">Yard locations</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? "Loading locations..." : `${yards.length} configured locations`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-50 disabled:opacity-50"
            disabled={loading || exporting}
            onClick={() => void exportYardOccupancy()}
            type="button"
          >
            {exporting ? "Exporting..." : "Export occupancy CSV"}
          </button>
          <button
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
            onClick={() => setReloadKey((key) => key + 1)}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>
      {yards.length > 0 ? (
        <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {yards.map((yard) => (
            <YardEditor
              key={yard.id}
              onSaved={handleSaved}
              onSessionRefresh={onSessionRefresh}
              session={session}
              yard={yard}
            />
          ))}
        </div>
      ) : !loading && !error ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No yard locations are configured.
        </p>
      ) : null}
    </section>
  );
}
