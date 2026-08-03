"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { AuthUser, getCurrentUser } from "@/lib/auth";
import { registerPushNotifications } from "@/lib/push";
import { loadWorkflowLabelOverrides } from "@/lib/ticketing/workflow-labels";
import { loadPriorityLabelOverrides } from "@/lib/ticketing/priority-labels";
import { loadServiceTypeOverrides } from "@/lib/ticketing/service-types";

// Static prefix-match, most-specific first — the TopBar title should reflect
// what page you're actually on, not always the same brand name.
const PAGE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/dashboard/tickets/new", title: "New Ticket" },
  { prefix: "/dashboard/tickets/", title: "Ticket Detail" },
  { prefix: "/dashboard/fsv/", title: "Field Service Visit" },
  { prefix: "/dashboard/quotations/", title: "Quotation" },
  { prefix: "/dashboard/call-center", title: "Call Center Dashboard" },
  { prefix: "/dashboard/asm", title: "ASM Dashboard" },
  { prefix: "/dashboard/cs-support", title: "CS Support Dashboard" },
  { prefix: "/dashboard/executive", title: "Executive Dashboard" },
  { prefix: "/dashboard/my-tickets", title: "My Tickets" },
  { prefix: "/dashboard/customers/", title: "Customer Detail" },
  { prefix: "/dashboard/customers", title: "Customers" },
  { prefix: "/dashboard/admin/users", title: "User Management" },
  { prefix: "/dashboard/admin/region-mapping", title: "Regions & Territories" },
  { prefix: "/dashboard/admin/sync-monitor", title: "Sync Monitor" },
  { prefix: "/dashboard/admin/equipment", title: "Equipment" },
  { prefix: "/dashboard/admin/amc-contracts", title: "AMC Contracts" },
  { prefix: "/dashboard/admin/billing-rates", title: "Billing Rates" },
  { prefix: "/dashboard/admin/workflow-labels", title: "Workflow States & Transitions" },
  { prefix: "/dashboard/admin/priority-labels", title: "Ticket Priorities" },
  { prefix: "/dashboard/admin/service-types", title: "Service Types" },
  { prefix: "/dashboard/admin/skill-tags", title: "Skill Tags" },
  { prefix: "/dashboard/admin/audit-log", title: "Audit Log" },
  { prefix: "/dashboard/admin", title: "Admin Console" },
  { prefix: "/dashboard/dashboards", title: "Dashboards" },
];

// /dashboard/service is shared by Admin and Manager/Service-Aftersales-Head
// (Sidebar.tsx's ticketingNavItem) — the title should reflect which one is
// actually looking, not always say "Manager Dashboard".
function titleForPath(pathname: string, role: AuthUser["role"] | undefined): string {
  if (pathname.startsWith("/dashboard/service")) {
    return role === "ADMIN" ? "Tickets" : "Manager Dashboard";
  }
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
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
    registerPushNotifications();
    loadWorkflowLabelOverrides();
    loadPriorityLabelOverrides();
    loadServiceTypeOverrides();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <TopBar title={titleForPath(pathname, user?.role)} onMenuClick={() => setSidebarOpen((v) => !v)} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
