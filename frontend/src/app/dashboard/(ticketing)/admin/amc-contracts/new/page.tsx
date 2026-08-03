"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AmcContractForm from "@/components/amc/AmcContractForm";
import { AmcContractRecord, getAmcContract } from "@/lib/ticketing/amc";

function NewAmcContractInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const renewFrom = searchParams.get("renewFrom");

  // Contract renewal (2026-08-03) — ?renewFrom=<oldContractId> prefills the
  // form from that contract (same customer/equipment/coverage/terms as a
  // starting point, all still editable) and routes the submit through
  // renewAmcContract() instead of createAmcContract() — see AmcContractForm's
  // prefillFrom/renewFromId props.
  const [prefillFrom, setPrefillFrom] = useState<AmcContractRecord | null>(null);
  const [loading, setLoading] = useState(!!renewFrom);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!renewFrom) return;
    getAmcContract(renewFrom)
      .then(setPrefillFrom)
      .catch(() => setError("Could not load the contract being renewed."))
      .finally(() => setLoading(false));
  }, [renewFrom]);

  if (loading) return <p className="p-8 text-sm text-muted">Loading…</p>;

  return (
    <div className="w-full px-6 py-10">
      <a
        href="/dashboard/admin/amc-contracts"
        className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy"
      >
        ← AMC Contracts
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">{renewFrom ? "Renew AMC Contract" : "New AMC Contract"}</h1>
      <p className="mb-6 text-sm text-muted">
        {renewFrom
          ? "Pre-filled from the contract being renewed — update the dates, value, and anything else that's changed before saving."
          : "Define coverage, terms, and covered equipment for a new contract."}
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <div className="rounded-lg border border-line bg-white p-5">
        <AmcContractForm
          prefillFrom={prefillFrom ?? undefined}
          renewFromId={renewFrom ?? undefined}
          onSaved={(c) => router.push(`/dashboard/admin/amc-contracts/${c.id}`)}
        />
      </div>
    </div>
  );
}

export default function NewAmcContractPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Loading…</p>}>
      <NewAmcContractInner />
    </Suspense>
  );
}
