"use client";

import { use, useEffect, useState } from "react";
import EquipmentForm from "@/components/equipment/EquipmentForm";
import { EquipmentRecord, getEquipment } from "@/lib/ticketing/equipment-admin";

export default function EditEquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [equipment, setEquipment] = useState<EquipmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getEquipment(id)
      .then(setEquipment)
      .catch(() => setError("Could not load this equipment record."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="p-8 text-sm text-muted">Loading…</p>;
  if (error || !equipment) return <p className="p-8 text-sm text-brand-red">{error ?? "Not found."}</p>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a href="/dashboard/admin/equipment" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Equipment
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">{equipment.serialNo}</h1>
      <p className="mb-6 text-sm text-muted">{equipment.customer?.customerName}</p>

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
