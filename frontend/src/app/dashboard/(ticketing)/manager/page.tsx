"use client";

import { useEffect, useState } from "react";
import { AuthUser, getCurrentUser } from "@/lib/auth";
import ManagerSummarySection from "@/components/dashboards/ManagerSummarySection";

// §10.1 W-05 Manager Dashboard (2026-08-04) — split out from /dashboard/service
// (client request: that page should just be the Ticket List — W-07 — with
// the KPI/summary content on its own dedicated page). Manager/Admin only,
// enforced both by the Sidebar link and by the manager-summary API's own
// @Roles guard. "New Ticket" lives on the Tickets page only (2026-08-04
// follow-up) — no reason to duplicate it here.
//
// Same page for both roles — the backend already renders it differently:
// region-scoped (Manager's own region(s) only) vs org-wide/all-region
// (Admin) — see DashboardsAceService.managerSummary(). Title/description
// just reflect which one is actually being shown (2026-08-04 clarification
// — Admin still needs a Dashboard link, just an unscoped one, not none).
export default function ManagerDashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-[22px] font-black text-navy">{isAdmin ? "Admin Dashboard" : "Manager Dashboard"}</h2>
        <p className="text-sm text-muted">
          {isAdmin
            ? "KPI snapshot, regional breakdown, AMC pipeline, revenue, at-risk accounts — all regions"
            : "KPI snapshot, regional breakdown, AMC pipeline, revenue, at-risk accounts — your region(s)"}
        </p>
      </div>

      <ManagerSummarySection />
    </div>
  );
}
