"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthUser, Role, getCurrentUser } from "@/lib/auth";

interface NavItem {
  label: string;
  href: string | null;
  /** Roles that can see this item. Admin always sees everything (universal
   * bypass, matches the backend's RolesGuard convention) — no need to list
   * ADMIN in every entry. */
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Service (Tickets)",
    href: "/dashboard/service",
    roles: ["CALL_CENTER", "ASM", "ENGINEER", "MANAGER", "SERVICE_AFTERSALES_HEAD"],
  },
  { label: "Manufacturing", href: "/dashboard/manufacturing", roles: ["MANUFACTURING_HEAD"] },
  { label: "Sales", href: null, roles: ["SALES_HEAD_AGGREGATE", "SALES_HEAD_IM_BMH"] },
  { label: "Finance", href: null, roles: ["FINANCE_HEAD"] },
  { label: "Procurement", href: null, roles: ["PROCUREMENT_HEAD"] },
  { label: "Dispatch", href: null, roles: ["DISPATCH_HEAD"] },
  { label: "Stores", href: null, roles: ["STORES_HEAD"] },
  { label: "Admin", href: "/dashboard/admin", roles: [] }, // Admin-only, via the bypass below
];

function visibleTo(item: NavItem, user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true; // universal bypass, same as backend RolesGuard
  return item.roles.includes(user.role);
}

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const items = NAV_ITEMS.filter((item) => visibleTo(item, user));

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col bg-navy text-white/80">
      <div className="px-5 py-5">
        <h1 className="text-[15px] font-bold tracking-wide text-white">
          PROMAN <span className="text-orange">EDGE</span>
        </h1>
      </div>

      <nav className="flex-1 px-2">
        {items.map((item) => {
          const active = item.href && pathname === item.href;
          if (!item.href) {
            return (
              <span
                key={item.label}
                title="Not built yet"
                className="mb-0.5 block cursor-not-allowed rounded-md border-l-2 border-transparent px-3 py-2 text-[13.5px] text-white/30"
              >
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`mb-0.5 block rounded-md px-3 py-2 text-[13.5px] transition ${
                active
                  ? "border-l-2 border-orange bg-white/5 font-medium text-white"
                  : "border-l-2 border-transparent text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4 text-[11px] text-white/40">
        PISPL Field Service · v2.4
      </div>
    </aside>
  );
}
