"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { AmcContractRecord, listAmcContracts } from "@/lib/ticketing/amc";

const RENEWAL_STYLE: Record<string, string> = {
  ACTIVE: "bg-brand-green-bg text-brand-green",
  RENEWAL_DUE: "bg-brand-amber-bg text-brand-amber",
  FINAL_NOTICE: "bg-brand-amber-bg text-brand-amber",
  LAPSED: "bg-brand-red-bg text-brand-red",
  RENEWED: "bg-navy-tint text-navy",
};

export default function AmcContractsPage() {
  const [contracts, setContracts] = useState<AmcContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAmcContracts()
      .then(setContracts)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin/Manager access required.");
        else setError("Could not load AMC contracts.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">AMC Contracts</h1>
        <Link
          href="/dashboard/admin/amc-contracts/new"
          className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy transition"
        >
          New AMC Contract
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted">
        Annual Maintenance Contracts — app-only, no ERPNext equivalent. Coverage decides AMC vs. warranty vs.
        out-of-cover on tickets.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : contracts.length === 0 ? (
        <p className="text-sm text-muted">No AMC contracts yet.</p>
      ) : (
        <table className="w-full rounded-lg border border-line bg-white text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">Reference No.</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Equipment Covered</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-navy">{c.contractReferenceNo}</td>
                <td className="px-4 py-3 text-muted">{c.customer?.customerName ?? "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {new Date(c.startDate).toLocaleDateString()} – {new Date(c.endDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-muted">{c.coveredEquipment?.length ?? 0}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${RENEWAL_STYLE[c.renewalStatus] ?? "bg-navy-tint text-navy"}`}
                  >
                    {c.renewalStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/dashboard/admin/amc-contracts/${c.id}`} className="text-xs font-bold text-navy hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
