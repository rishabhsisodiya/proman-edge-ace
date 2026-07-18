"use client";

import { FormEvent, useState } from "react";
import { ApiError } from "@/lib/api";
import { changePassword } from "@/lib/auth";

interface Props {
  /** Forced flow (first login) skips the "why" framing and can't be dismissed. */
  forced?: boolean;
}

export default function ChangePasswordForm({ forced }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setDone(true);
      // Backend invalidates every existing token on password change (§8.2) —
      // this session's own cookies are now dead too, so re-login is required.
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        const msg = Array.isArray(body?.message) ? body!.message.join(", ") : body?.message;
        setError(msg ?? "Could not change password.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md bg-brand-green-bg px-4 py-3 text-sm text-brand-green">
        Password changed. Redirecting to login…
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-line bg-white p-4">
      {forced && (
        <p className="mb-4 text-sm text-muted">
          This is your first login — you must set a new password before continuing.
        </p>
      )}

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-bold text-navy">Current password</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
        />
      </div>
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-bold text-navy">New password</label>
        <input
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
        />
        <p className="mt-1 text-[11px] text-muted">
          Min 8 characters, with an uppercase letter, a number, and a special character.
        </p>
      </div>
      <div className="mb-6">
        <label className="mb-1.5 block text-xs font-bold text-navy">Confirm new password</label>
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
        />
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="h-11 w-full rounded-md bg-orange text-sm font-bold text-navy transition disabled:opacity-50"
      >
        {loading ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
