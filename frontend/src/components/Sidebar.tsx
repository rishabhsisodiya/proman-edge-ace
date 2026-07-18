"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Service (Tickets)", href: "/dashboard/service" },
  { label: "Manufacturing", href: "/dashboard/manufacturing" },
  { label: "Sales", href: null },
  { label: "Finance", href: null },
  { label: "Procurement", href: null },
  { label: "Dispatch", href: null },
  { label: "Stores", href: null },
  { label: "Admin", href: null },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col bg-navy text-white/80">
      <div className="px-5 py-5">
        <h1 className="text-[15px] font-bold tracking-wide text-white">
          PROMAN <span className="text-orange">EDGE</span>
        </h1>
      </div>

      <nav className="flex-1 px-2">
        {NAV_ITEMS.map((item) => {
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
