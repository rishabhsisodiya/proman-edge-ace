"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthUser, Role, getCurrentUser } from "@/lib/auth";

interface NavItem {
  label: string;
  href: string | null;
  /** Roles that can see this item — checked strictly, no Admin bypass (see ERP_NAV_ITEMS below). */
  roles: Role[];
}

// One ticketing nav entry per role (§6.1 — each role gets its own dashboard,
// not a shared one) — a function, not a static list, since the label/href
// depend on which role is looking, not on a fixed roles[] membership check.
function ticketingNavItem(role: Role | undefined): NavItem | null {
  switch (role) {
    case "CALL_CENTER":
      return { label: "Dashboard", href: "/dashboard/call-center", roles: [] };
    case "ASM":
      return { label: "Dashboard", href: "/dashboard/asm", roles: [] };
    case "ENGINEER":
      return { label: "My Tickets", href: "/dashboard/my-tickets", roles: [] };
    case "MANAGER":
    case "SERVICE_AFTERSALES_HEAD":
    case "ADMIN": // Admin browses the unscoped Manager-style view; Admin Console is separate
      return { label: "Tickets", href: "/dashboard/service", roles: [] };
    default:
      return null;
  }
}

// ERP dashboard modules (Manufacturing/Sales/Finance/Procurement/Dispatch/
// Stores) belong to a separate product area (the original Proman Edge ERP
// dashboards, not ACE ticketing) — shown only to their own head role, never
// via Admin's bypass. Admin gets a "Dashboards" hub instead (see below), not
// a flat list of every ERP module.
const ERP_NAV_ITEMS: NavItem[] = [
  { label: "Manufacturing", href: "/dashboard/manufacturing", roles: ["MANUFACTURING_HEAD"] },
  { label: "Sales", href: null, roles: ["SALES_HEAD_AGGREGATE", "SALES_HEAD_IM_BMH"] },
  { label: "Finance", href: null, roles: ["FINANCE_HEAD"] },
  { label: "Procurement", href: null, roles: ["PROCUREMENT_HEAD"] },
  { label: "Dispatch", href: null, roles: ["DISPATCH_HEAD"] },
  { label: "Stores", href: null, roles: ["STORES_HEAD"] },
];

const ADMIN_ONLY_ITEMS: NavItem[] = [
  { label: "Dashboards", href: "/dashboard/dashboards", roles: [] },
  { label: "Admin", href: "/dashboard/admin", roles: [] },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  // Auto-close the mobile drawer on navigation, so tapping a link doesn't
  // leave the overlay sitting open behind the new page.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const ticketItem = ticketingNavItem(user?.role);
  const erpItems = ERP_NAV_ITEMS.filter((item) => user && item.roles.includes(user.role)); // strict — no Admin bypass here
  const adminItems = user?.role === "ADMIN" ? ADMIN_ONLY_ITEMS : [];
  const items = [...(ticketItem ? [ticketItem] : []), ...erpItems, ...adminItems];

  return (
    <>
      {/* Backdrop — mobile only, closes the drawer on tap outside it */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-[220px] shrink-0 flex-col bg-navy text-white/80 transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-5">
          <h1 className="text-[15px] font-bold tracking-wide text-white">
            PROMAN <span className="text-orange">EDGE</span>
          </h1>
        </div>

        <nav className="flex-1 overflow-y-auto px-2">
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
    </>
  );
}
