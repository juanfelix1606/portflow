import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createManagedUser,
  exportManagedUsers,
  listManagedUsers,
  resetManagedUserPassword,
  saveCsvDownload,
  updateManagedUser,
  withSessionRefresh
} from "./dashboard-api.js";
import type {
  CreateManagedUserInput,
  ManagedUser,
  UpdateManagedUserInput,
  UserRole,
  UserSession
} from "./dashboard-api.js";

const userRoles: UserRole[] = ["ADMIN", "GATE_OPERATOR", "YARD_OPERATOR"];

function roleLabel(role: UserRole): string {
  return role.replace("_", " ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed. Please try again.";
}

const fieldClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";

function CreateUserForm({
  session,
  onSessionRefresh,
  onCreated
}: {
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
  onCreated: (user: ManagedUser) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("GATE_OPERATOR");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const input: CreateManagedUserInput = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role
    };

    try {
      const user = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        createManagedUser(activeSession, input)
      );
      setName("");
      setEmail("");
      setPassword("");
      setRole("GATE_OPERATOR");
      onCreated(user);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4 sm:grid-cols-2 xl:grid-cols-[1.1fr_1.2fr_1fr_1fr_auto]" onSubmit={(event) => void submit(event)}>
      <label>
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Full name</span>
        <input
          autoComplete="name"
          className={fieldClassName}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email address</span>
        <input
          autoComplete="email"
          className={fieldClassName}
          maxLength={254}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Temporary password</span>
        <input
          autoComplete="new-password"
          className={fieldClassName}
          maxLength={128}
          minLength={12}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Role</span>
        <select className={fieldClassName} onChange={(event) => setRole(event.target.value as UserRole)} value={role}>
          {userRoles.map((option) => (
            <option key={option} value={option}>{roleLabel(option)}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end sm:col-span-2 xl:col-span-1">
        <button
          className="w-full rounded-xl bg-[#10283d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183b56] disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Creating..." : "Create user"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-700 sm:col-span-2 xl:col-span-5" role="alert">{error}</p>}
      <p className="text-xs leading-5 text-slate-500 sm:col-span-2 xl:col-span-5">
        Passwords must contain at least 12 characters. The API hashes credentials before storage.
      </p>
    </form>
  );
}

function EditUserForm({
  user,
  session,
  onSessionRefresh,
  onSaved,
  onPasswordReset,
  onCancel
}: {
  user: ManagedUser;
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
  onSaved: (user: ManagedUser) => void;
  onPasswordReset: (user: ManagedUser, session: UserSession) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [submitting, setSubmitting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const isSelf = user.id === session.user.id;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const input: UpdateManagedUserInput = {
      ...(name.trim() !== user.name ? { name: name.trim() } : {}),
      ...(!isSelf && role !== user.role ? { role } : {}),
      ...(!isSelf && isActive !== user.isActive ? { isActive } : {})
    };

    if (Object.keys(input).length === 0) {
      setError("No changes to save.");
      setSubmitting(false);
      return;
    }

    try {
      const updated = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        updateManagedUser(activeSession, user.id, input)
      );
      onSaved(updated);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword() {
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError("Password must contain between 12 and 128 characters.");
      return;
    }

    setError("");
    setResettingPassword(true);
    try {
      const activeSession = await withSessionRefresh(session, onSessionRefresh, async (currentSession) => {
        await resetManagedUserPassword(currentSession, user.id, newPassword);
        return currentSession;
      });
      setNewPassword("");
      onPasswordReset(user, activeSession);
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setResettingPassword(false);
    }
  }

  return (
    <form className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03]" onSubmit={(event) => void submit(event)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-slate-400 uppercase">Edit user</p>
          <h3 className="mt-1 text-lg font-bold text-slate-800">{user.email}</h3>
        </div>
        <button className="text-xs font-semibold text-slate-400 hover:text-slate-700" onClick={onCancel} type="button">
          Close
        </button>
      </div>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Full name</span>
        <input
          autoComplete="name"
          className={fieldClassName}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </label>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Role</span>
        <select
          className={fieldClassName}
          disabled={isSelf}
          onChange={(event) => setRole(event.target.value as UserRole)}
          value={role}
        >
          {userRoles.map((option) => (
            <option key={option} value={option}>{roleLabel(option)}</option>
          ))}
        </select>
      </label>
      <label className={`mt-4 flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-3.5 py-3 ${isSelf ? "opacity-60" : ""}`}>
        <span>
          <span className="block text-sm font-semibold text-slate-700">Account active</span>
          <span className="mt-0.5 block text-xs text-slate-400">Inactive users cannot sign in.</span>
        </span>
        <input
          checked={isActive}
          disabled={isSelf}
          onChange={(event) => setIsActive(event.target.checked)}
          type="checkbox"
        />
      </label>
      {isSelf && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          You cannot change your own role or deactivate your own account.
        </p>
      )}
      {!isSelf && user.role === "ADMIN" && user.isActive && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          The API prevents deactivating the last active administrator.
        </p>
      )}
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Share the temporary password with the user through a separate secure channel. It is cleared after reset; the user must replace it at sign-in.
      </p>
      <label className="mt-5 block border-t border-slate-100 pt-4">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Temporary password</span>
        <input
          autoComplete="new-password"
          className={fieldClassName}
          maxLength={128}
          minLength={12}
          onChange={(event) => setNewPassword(event.target.value)}
          type="password"
          value={newPassword}
        />
      </label>
      <button
        className="mt-3 w-full rounded-xl border border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-60"
        disabled={resettingPassword || submitting}
        onClick={() => void resetPassword()}
        type="button"
      >
        {resettingPassword ? "Setting temporary password..." : "Set temporary password and sign out sessions"}
      </button>
      {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
      <button
        className="mt-5 w-full rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export default function AdminUsers({
  session,
  onSessionRefresh
}: {
  session: UserSession;
  onSessionRefresh: (session: UserSession) => void;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const isActive = activeFilter === "all" ? undefined : activeFilter === "active";

    void withSessionRefresh(session, onSessionRefresh, (activeSession) =>
      listManagedUsers(activeSession.accessToken, {
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(role ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {})
      })
    )
      .then((result) => {
        if (active) {
          setUsers(result.data);
          setPagination(result.pagination);
          if (selectedUser && !result.data.some((user) => user.id === selectedUser.id)) {
            setSelectedUser(null);
          }
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(errorMessage(loadError));
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
  }, [session.accessToken, onSessionRefresh, page, search, role, activeFilter, reloadKey]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function handleCreated(user: ManagedUser) {
    setNotice(`${user.name} was created.`);
    setSelectedUser(null);
    setSearchInput("");
    setSearch("");
    setPage(1);
    setReloadKey((key) => key + 1);
  }

  function handleSaved(user: ManagedUser) {
    setNotice(`${user.name}'s account was updated.`);
    setSelectedUser(null);
    if (user.id === session.user.id) {
      onSessionRefresh({ ...session, user: { ...session.user, name: user.name } });
    }
    setReloadKey((key) => key + 1);
  }

  function handlePasswordReset(user: ManagedUser, activeSession: UserSession) {
    setNotice(
      `${user.name}'s temporary password was set; existing sessions were signed out and the user must change it at next sign-in.`
    );
    if (user.id === session.user.id) {
      onSessionRefresh({
        ...activeSession,
        user: { ...activeSession.user, mustChangePassword: true }
      });
    }
  }

  async function exportUserDirectory() {
    setError("");
    setExporting(true);
    const isActive = activeFilter === "all" ? undefined : activeFilter === "active";
    try {
      const blob = await withSessionRefresh(session, onSessionRefresh, (activeSession) =>
        exportManagedUsers(activeSession.accessToken, {
          ...(search ? { search } : {}),
          ...(role ? { role } : {}),
          ...(isActive !== undefined ? { isActive } : {})
        })
      );
      saveCsvDownload(blob, "portflow-managed-users.csv");
    } catch (exportError) {
      setError(errorMessage(exportError));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-5">
      <details className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
        <summary className="cursor-pointer list-none text-sm font-bold text-slate-800">
          <span className="flex items-center justify-between">
            Create a user
            <span className="text-xs font-semibold text-cyan-700 group-open:hidden">Open form +</span>
            <span className="hidden text-xs font-semibold text-slate-400 group-open:inline">Close −</span>
          </span>
        </summary>
        <div className="mt-4">
          <CreateUserForm
            onCreated={handleCreated}
            onSessionRefresh={onSessionRefresh}
            session={session}
          />
        </div>
      </details>

      <form className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto]" onSubmit={applySearch}>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Search users</span>
          <input
            className={fieldClassName}
            maxLength={120}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Name or email"
            value={searchInput}
          />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Role</span>
          <select
            className={fieldClassName}
            onChange={(event) => {
              setPage(1);
              setRole(event.target.value as UserRole | "");
            }}
            value={role}
          >
            <option value="">All roles</option>
            {userRoles.map((option) => (
              <option key={option} value={option}>{roleLabel(option)}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Account status</span>
          <select
            className={fieldClassName}
            onChange={(event) => {
              setPage(1);
              setActiveFilter(event.target.value as "all" | "active" | "inactive");
            }}
            value={activeFilter}
          >
            <option value="all">All accounts</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <div className="flex items-end">
          <button className="w-full rounded-xl bg-[#10283d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183b56]" type="submit">
            Search
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

      <div className="grid items-start gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-800">User directory</h2>
              <p className="mt-1 text-xs text-slate-500">
                {loading ? "Loading users..." : `${pagination.total} users`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-50 disabled:opacity-50"
                disabled={loading || exporting}
                onClick={() => void exportUserDirectory()}
                type="button"
              >
                {exporting ? "Exporting..." : "Export CSV"}
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
          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50/80 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                  <tr>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Created</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr className="hover:bg-slate-50/60" key={user.id}>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-800">{user.name}</p>
                        <p className="mt-1 text-xs text-slate-400">{user.email}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate-600">{roleLabel(user.role)}</td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-400">
                        {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(user.createdAt))}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <button
                          className="text-xs font-bold text-cyan-700 hover:text-cyan-900"
                          onClick={() => setSelectedUser(user)}
                          type="button"
                        >
                          {selectedUser?.id === user.id ? "Editing" : "Edit"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              {loading ? "Loading users..." : "No users match these filters."}
            </p>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs">
            <button
              className="font-semibold text-slate-600 disabled:text-slate-300"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
              type="button"
            >
              Previous
            </button>
            <span className="text-slate-400">
              Page {pagination.totalPages === 0 ? 0 : page} of {pagination.totalPages}
            </span>
            <button
              className="font-semibold text-slate-600 disabled:text-slate-300"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </article>

        {selectedUser ? (
          <EditUserForm
            key={selectedUser.id}
            onCancel={() => setSelectedUser(null)}
            onPasswordReset={handlePasswordReset}
            onSaved={handleSaved}
            onSessionRefresh={onSessionRefresh}
            session={session}
            user={selectedUser}
          />
        ) : (
          <aside className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10">
            <p className="text-sm font-semibold text-slate-700">Administrator controls</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              User changes are audited by the API. Password hashes are never returned, and the backend preserves at least one active administrator.
            </p>
          </aside>
        )}
      </div>
    </section>
  );
}
