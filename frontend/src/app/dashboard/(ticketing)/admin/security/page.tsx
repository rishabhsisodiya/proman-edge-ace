"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { getLockedUsers, unlockUser, LockableUser } from "@/lib/auth";
import { formatIst } from "@/lib/format";

// Minimal admin screen for §8.2's "Admin can unlock" requirement — NOT the
// full §10.1 User Management screen (that's a separate, larger piece of work
// covering all user CRUD; this page only surfaces the lockout-specific view
// and action so it isn't left API-only). See Jira Gap Tracker §2.15.
export default function AdminLockedAccountsPage() {
  const [users, setUsers] = useState<LockableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getLockedUsers()
      .then(setUsers)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setError("Admin access required.");
        } else {
          setError("Could not load locked accounts.");
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onUnlock(id: string) {
    setUnlockingId(id);
    try {
      await unlockUser(id);
      load();
    } catch {
      setError("Could not unlock this account.");
    } finally {
      setUnlockingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Login &amp; Security — Locked Accounts</h1>
      <p className="mb-6 text-sm text-muted">
        Accounts currently locked out after 5 failed login attempts (auto-unlocks after 30 minutes).
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted">No accounts are currently locked.</p>
      ) : (
        <table className="w-full rounded-lg border border-line bg-white text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Locked until</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{u.fullName}</td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3 text-muted">{u.role}</td>
                <td className="px-4 py-3 text-muted">
                  {u.lockedUntil ? formatIst(u.lockedUntil) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onUnlock(u.id)}
                    disabled={unlockingId === u.id}
                    className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy transition disabled:opacity-50"
                  >
                    {unlockingId === u.id ? "Unlocking…" : "Unlock"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
