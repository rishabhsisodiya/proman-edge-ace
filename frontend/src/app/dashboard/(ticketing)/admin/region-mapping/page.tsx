"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createRegionMapping,
  deleteRegionMapping,
  listRegionMappings,
  RegionMapping,
  updateRegionMapping,
} from "@/lib/ticketing/region-mappings";
import { Region } from "@/lib/ticketing/types";

const REGIONS: Region[] = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL", "BANGLADESH"];

// Admin-maintained mapping from ERPNext's territory field (state-level, ~33
// messy values e.g. "Tamilnadu" vs "Tamil Nadu") onto the app's Region enum.
// Read by the nightly Customer Sync job — a customer whose territory isn't
// mapped here yet is flagged needsReview instead of failing the sync.
export default function RegionMappingPage() {
  const [mappings, setMappings] = useState<RegionMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newTerritory, setNewTerritory] = useState("");
  const [newRegion, setNewRegion] = useState<Region>("NORTH");
  const [adding, setAdding] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listRegionMappings()
      .then(setMappings)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setError("Admin access required.");
        } else {
          setError("Could not load region mappings.");
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTerritory.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await createRegionMapping(newTerritory.trim(), newRegion);
      setNewTerritory("");
      load();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { message?: string }) : null;
      setError(body?.message ?? "Could not add mapping — it may already exist.");
    } finally {
      setAdding(false);
    }
  }

  async function onUpdate(id: string, region: Region) {
    setBusyId(id);
    try {
      await updateRegionMapping(id, region);
      load();
    } catch {
      setError("Could not update mapping.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    setBusyId(id);
    try {
      await deleteRegionMapping(id);
      load();
    } catch {
      setError("Could not delete mapping.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Regions &amp; Territories</h1>
      <p className="mb-6 text-sm text-muted">
        Maps ERPNext&apos;s territory field onto this app&apos;s Region list. The nightly Customer Sync job uses
        this to resolve each customer&apos;s region — a territory with no mapping here leaves that customer
        flagged for review instead of blocking the sync.
      </p>

      <form onSubmit={onAdd} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">ERPNext territory</label>
          <input
            type="text"
            value={newTerritory}
            onChange={(e) => setNewTerritory(e.target.value)}
            placeholder="e.g. Tamil Nadu"
            className="h-9 w-56 rounded-md border border-line px-2 text-sm text-navy placeholder:text-text-disabled"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Region</label>
          <select
            value={newRegion}
            onChange={(e) => setNewRegion(e.target.value as Region)}
            className="h-9 rounded-md border border-line px-2 text-sm text-navy"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={adding || !newTerritory.trim()}
          className="h-9 rounded-md bg-orange px-4 text-sm font-bold text-navy transition disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add Mapping"}
        </button>
      </form>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : mappings.length === 0 ? (
        <p className="text-sm text-muted">No mappings yet — add one above.</p>
      ) : (
        <table className="w-full rounded-lg border border-line bg-white text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">ERPNext Territory</th>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-navy">{m.erpTerritory}</td>
                <td className="px-4 py-3">
                  <select
                    value={m.region}
                    disabled={busyId === m.id}
                    onChange={(e) => onUpdate(m.id, e.target.value as Region)}
                    className="h-8 rounded-md border border-line px-2 text-xs text-navy disabled:opacity-50"
                  >
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(m.id)}
                    disabled={busyId === m.id}
                    className="text-xs font-bold text-brand-red disabled:opacity-50"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
