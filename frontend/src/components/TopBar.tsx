"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthUser, getCurrentUser, logout } from "@/lib/auth";

const ROLE_LABEL: Record<string, string> = {
  CALL_CENTER: "Call Center",
  ASM: "Area Service Manager",
  ENGINEER: "Service Engineer",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TopBar({ title, onMenuClick }: { title: string; onMenuClick?: () => void }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  return (
    <div className="flex items-center justify-between border-b border-line bg-white px-4 py-4 sm:px-8">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            aria-label="Open menu"
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-navy md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <h2 className="text-base font-semibold text-foreground sm:text-lg">{title}</h2>
      </div>

      {user && (
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-foreground">{user.fullName}</p>
              <p className="text-xs text-muted">{ROLE_LABEL[user.role] ?? user.role}</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
              {initials(user.fullName)}
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-12 w-40 rounded-lg border border-line bg-white py-1 shadow-lg">
              <Link
                href="/account"
                onClick={() => setMenuOpen(false)}
                className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-zinc-50"
              >
                My Account
              </Link>
              <button
                onClick={logout}
                className="w-full px-4 py-2 text-left text-sm text-brand-red hover:bg-zinc-50"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
