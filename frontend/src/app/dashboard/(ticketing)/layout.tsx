"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

// Static prefix-match, most-specific first — the TopBar title should reflect
// what page you're actually on, not always the same brand name.
const PAGE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/dashboard/tickets/new", title: "New Ticket" },
  { prefix: "/dashboard/tickets/", title: "Ticket Detail" },
  { prefix: "/dashboard/fsv/", title: "Field Service Visit" },
  { prefix: "/dashboard/quotations/", title: "Quotation" },
  { prefix: "/dashboard/call-center", title: "Call Center Dashboard" },
  { prefix: "/dashboard/asm", title: "ASM Dashboard" },
  { prefix: "/dashboard/my-tickets", title: "My Tickets" },
  { prefix: "/dashboard/service", title: "Manager Dashboard" },
  { prefix: "/dashboard/admin/security", title: "Login & Security" },
  { prefix: "/dashboard/admin/region-mapping", title: "Regions & Territories" },
  { prefix: "/dashboard/admin/sync-monitor", title: "Sync Monitor" },
  { prefix: "/dashboard/admin/equipment", title: "Equipment" },
  { prefix: "/dashboard/admin/amc-contracts", title: "AMC Contracts" },
  { prefix: "/dashboard/admin/billing-rates", title: "Billing Rates" },
  { prefix: "/dashboard/admin", title: "Admin Console" },
  { prefix: "/dashboard/dashboards", title: "Dashboards" },
];

function titleForPath(pathname: string): string {
  const match = PAGE_TITLES.find((p) => pathname.startsWith(p.prefix));
  return match?.title ?? "Proman Edge - ACE Service";
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <TopBar title={titleForPath(pathname)} onMenuClick={() => setSidebarOpen((v) => !v)} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
