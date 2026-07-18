"use client";

import { useEffect, useState } from "react";
import { AuthUser, getCurrentUser, logout } from "@/lib/auth";

export default function Header() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  return (
    <header className="flex items-center justify-between gap-4 bg-navy px-7 py-3 text-white">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[19px] font-semibold tracking-wide">
          PROMAN <span className="text-orange">ACE</span>
        </h1>
        <p className="hidden text-[13px] text-white/60 sm:block">
          Service Ticketing Platform
        </p>
      </div>

      {user && (
        <div className="flex items-center gap-3 text-sm">
          <div className="text-right">
            <p className="font-medium">{user.fullName}</p>
            <p className="text-[11px] uppercase tracking-wide text-white/60">
              {user.role.replace("_", " ")}
            </p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      )}
    </header>
  );
}
