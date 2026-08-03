"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AmcContractForm from "@/components/amc/AmcContractForm";
import { AmcContractRecord, getAmcContract } from "@/lib/ticketing/amc";

export default function EditAmcContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [contract, setContract] = useState<AmcContractRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAmcContract(id)
      .then(setContract)
      .catch(() => setError("Could not load this AMC contract."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="p-8 text-sm text-muted">Loading…</p>;
  if (error || !contract) return <p className="p-8 text-sm text-brand-red">{error ?? "Not found."}</p>;

  return (
    <div className="w-full px-6 py-10">
      <a
        href="/dashboard/admin/amc-contracts"
        className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy"
      >
        ← AMC Contracts
      </a>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">{contract.contractReferenceNo}</h1>
        {contract.renewalStatus !== "RENEWED" && (
          <button
            onClick={() => router.push(`/dashboard/admin/amc-contracts/new?renewFrom=${contract.id}`)}
            className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy transition"
          >
            Renew Contract
          </button>
        )}
      </div>
      <p className="mb-6 text-sm text-muted">{contract.customer?.customerName}</p>

      <div className="rounded-lg border border-line bg-white p-5">
        <AmcContractForm
          existing={contract}
          onSaved={(c) => {
            setContract(c);
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
