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

        <details className="mt-6 rounded-lg border border-line bg-white text-xs">
          <summary className="cursor-pointer select-none px-3 py-2 font-bold text-navy">
            Seed users ({SEED_USERS.length}) — click a user to autofill (password: {SEED_PASSWORD})
          </summary>
          <div className="border-t border-line px-3 py-2">
            <p className="mb-1 mt-1 font-bold uppercase tracking-wide text-muted">Service Ticketing (ACE)</p>
            {SEED_USERS.filter((u) => u.group === "ticketing").map((u) => (
              <button
                key={u.email}
                type="button"
                onClick={() => {
                  setEmail(u.email);
                  setPassword(SEED_PASSWORD);
                }}
                className="block w-full py-0.5 text-left text-muted hover:text-navy"
              >
                {u.email} <span className="text-text-disabled">— {u.label}</span>
              </button>
            ))}
            <p className="mb-1 mt-3 font-bold uppercase tracking-wide text-muted">Business Dashboards (ERP)</p>
            {SEED_USERS.filter((u) => u.group === "erp").map((u) => (
              <button
                key={u.email}
                type="button"
                onClick={() => {
                  setEmail(u.email);
                  setPassword(SEED_PASSWORD);
                }}
                className="block w-full py-0.5 text-left text-muted hover:text-navy"
              >
                {u.email} <span className="text-text-disabled">— {u.label}</span>
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

// Mirrors backend/prisma/seed.ts exactly — update this list (and SEED_PASSWORD,
// if seed.ts's bcrypt.hash() call ever changes) if that file changes.
const SEED_PASSWORD = "Password@123";

const SEED_USERS: { email: string; label: string; group: "ticketing" | "erp" }[] = [
  { email: "admin@proman.test", label: "Admin", group: "ticketing" },
  { email: "manager@proman.test", label: "Manager", group: "ticketing" },
  { email: "asm@proman.test", label: "ASM", group: "ticketing" },
  { email: "engineer@proman.test", label: "Engineer", group: "ticketing" },
  { email: "callcenter@proman.test", label: "Call Center", group: "ticketing" },
  { email: "manufacturing@proman.test", label: "Manufacturing Head", group: "erp" },
  { email: "sales@proman.test", label: "Sales Head", group: "erp" },
  { email: "finance@proman.test", label: "Finance Head", group: "erp" },
  { email: "procurement@proman.test", label: "Procurement Head", group: "erp" },
  { email: "stores@proman.test", label: "Stores Head", group: "erp" },
  { email: "dispatch@proman.test", label: "Dispatch Head", group: "erp" },
];

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
