"use client";

import { useRouter } from "next/navigation";
import EquipmentForm from "@/components/equipment/EquipmentForm";

export default function NewEquipmentPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a href="/dashboard/admin/equipment" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Equipment
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">New Equipment</h1>
      <p className="mb-6 text-sm text-muted">Manual entry — primary onboarding path until ERPNext Serial No is usable.</p>

      <div className="rounded-lg border border-line bg-white p-5">
        <EquipmentForm onSaved={(eq) => router.push(`/dashboard/admin/equipment/${eq.id}`)} />
      </div>
    </div>
  );
}
