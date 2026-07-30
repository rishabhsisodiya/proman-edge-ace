"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { Pagination } from "@/components/Pagination";
import { EQUIP_CATEGORY_LABEL, EquipmentRecord, listEquipment } from "@/lib/ticketing/equipment-admin";

const PAGE_SIZE = 25;

export default function EquipmentListPage() {
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    listEquipment({ search: search || undefined, page, pageSize: PAGE_SIZE })
      .then((res) => {
        setEquipment(res.data);
        setTotal(res.total);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Access required.");
        else setError("Could not load equipment.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [search, page]);

  function onSearch() {
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Equipment</h1>
        <Link
          href="/dashboard/admin/equipment/new"
          className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy transition"
        >
          New Equipment
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">
        Manual equipment records — the primary onboarding path since ERPNext has no usable Serial No data yet.
      </p>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Search by serial no, item, or customer…"
          className="h-9 w-80 rounded-md border border-line px-3 text-sm text-navy placeholder:text-text-disabled"
        />
        <button onClick={onSearch} className="rounded-md bg-navy-tint px-3 py-1.5 text-xs font-bold text-navy">
          Search
        </button>
      </div>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : equipment.length === 0 ? (
        <p className="text-sm text-muted">No equipment records.</p>
      ) : (
        <table className="w-full rounded-lg border border-line bg-white text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">Serial No.</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Warranty</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {equipment.map((eq) => (
              <tr key={eq.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-navy">{eq.serialNo}</td>
                <td className="px-4 py-3 text-muted">{eq.itemName}</td>
                <td className="px-4 py-3 text-muted">{EQUIP_CATEGORY_LABEL[eq.equipmentCategory]}</td>
                <td className="px-4 py-3 text-muted">{eq.customer?.customerName ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{eq.warrantyStatus.replace(/_/g, " ")}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <span className="text-muted">{eq.status.replace(/_/g, " ")}</span>
                    {eq.possibleDuplicateOfId && !eq.duplicateFlagResolved && (
                      <span className="rounded-full bg-brand-amber-bg px-2 py-0.5 text-[10px] font-bold text-brand-amber">
                        Possible duplicate
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/dashboard/admin/equipment/${eq.id}`} className="text-xs font-bold text-navy hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && total > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} itemLabel="equipment record" />
      )}
    </div>
  );
}
