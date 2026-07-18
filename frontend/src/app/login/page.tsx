"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { dashboardPathForRole, login } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user, mustChangePassword } = await login(email, password);
      if (mustChangePassword) {
        router.push("/change-password");
        return;
      }
      const next = params.get("next");
      router.push(next ?? dashboardPathForRole(user.role));
    } catch (err) {
      if (err instanceof ApiError) {
        // Surface the backend's actual message — "Invalid credentials" for a
        // wrong password, but also the lockout/locked-until text (§8.2),
        // which a hardcoded generic message was previously swallowing.
        const body = err.body as { message?: string | string[] } | null;
        const msg = Array.isArray(body?.message) ? body!.message.join(", ") : body?.message;
        setError(msg ?? "Invalid email or password.");
      } else {
        setError("Could not reach the server. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black tracking-wide text-navy">
            PROMAN <span className="text-orange">EDGE</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Service Ticketing &amp; Business Dashboards</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-line bg-white p-4"
          style={{ boxShadow: "0 1px 4px rgba(42,47,105,.06)" }}
        >
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-bold text-navy">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy outline-none placeholder:text-text-disabled focus:border-navy focus:ring-2 focus:ring-navy/20"
              placeholder="you@proman.test"
            />
          </div>
          <div className="mb-6">
            <label className="mb-1.5 block text-xs font-bold text-navy">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy outline-none placeholder:text-text-disabled focus:border-navy focus:ring-2 focus:ring-navy/20"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-md bg-orange text-sm font-bold text-navy transition disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Seed users: manager@proman.test · asm@proman.test · engineer@proman.test ·
          callcenter@proman.test · manufacturing@proman.test · admin@proman.test — password: Password@123
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
