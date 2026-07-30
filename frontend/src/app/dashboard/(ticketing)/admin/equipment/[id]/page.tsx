"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EquipmentForm from "@/components/equipment/EquipmentForm";
import { ApiError } from "@/lib/api";
import { EquipmentRecord, getEquipment, resolveEquipmentDuplicate } from "@/lib/ticketing/equipment-admin";

export default function EditEquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [equipment, setEquipment] = useState<EquipmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    getEquipment(id)
      .then(setEquipment)
      .catch(() => setError("Could not load this equipment record."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function onResolve(action: "MERGE" | "DISMISS") {
    setResolving(true);
    setResolveError(null);
    try {
      const result = await resolveEquipmentDuplicate(id, action);
      if (action === "MERGE") {
        // This record was deleted server-side and its fields folded into the
        // original — the response is the original, so navigate there instead
        // of reloading this (now-gone) id.
        router.replace(`/dashboard/admin/equipment/${result.id}`);
      } else {
        load();
      }
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { message?: string }) : null;
      setResolveError(body?.message ?? "Could not resolve the duplicate flag.");
    } finally {
      setResolving(false);
    }
  }

  if (loading) return <p className="p-8 text-sm text-muted">Loading…</p>;
  if (error || !equipment) return <p className="p-8 text-sm text-brand-red">{error ?? "Not found."}</p>;

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin/equipment" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Equipment
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">{equipment.serialNo}</h1>
      <p className="mb-6 text-sm text-muted">{equipment.customer?.customerName}</p>

      {equipment.possibleDuplicateOfId && !equipment.duplicateFlagResolved && equipment.possibleDuplicateOf && (
        <div className="mb-6 rounded-lg border border-brand-amber bg-brand-amber-bg p-4">
          <p className="mb-1 text-sm font-bold text-brand-amber">Possible duplicate</p>
          <p className="mb-3 text-sm text-navy">
            This synced record may be the same physical unit as existing equipment{" "}
            <a href={`/dashboard/admin/equipment/${equipment.possibleDuplicateOf.id}`} className="underline">
              {equipment.possibleDuplicateOf.serialNo} — {equipment.possibleDuplicateOf.itemName}
            </a>{" "}
            (matched on same customer + item code — ERP&apos;s serial ID has no relation to a manually-entered one,
            so this is a suggestion, not a certainty).
          </p>
          {resolveError && <p className="mb-3 text-xs text-brand-red">{resolveError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => onResolve("MERGE")}
              disabled={resolving}
              className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy transition disabled:opacity-50"
            >
              {resolving ? "Working…" : "Same unit — merge into original"}
            </button>
            <button
              onClick={() => onResolve("DISMISS")}
              disabled={resolving}
              className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-bold text-navy transition disabled:opacity-50"
            >
              Different units — dismiss
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line bg-white p-5">
        <EquipmentForm
          existing={equipment}
          onSaved={(eq) => {
            setEquipment(eq);
            setSaved(true);
            setTimeout(() => setSaved(false), 4000);
          }}
        />
        {saved && (
          <p className="mt-4 rounded-md border border-brand-green bg-brand-green-bg px-4 py-3 text-sm font-bold text-brand-green">
            ✓ Saved successfully
          </p>
        )}
      </div>
    </div>
  );
}
