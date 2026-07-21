"use client";

import { useRouter } from "next/navigation";
import AmcContractForm from "@/components/amc/AmcContractForm";

export default function NewAmcContractPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a
        href="/dashboard/admin/amc-contracts"
        className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy"
      >
        ← AMC Contracts
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">New AMC Contract</h1>
      <p className="mb-6 text-sm text-muted">Define coverage, terms, and covered equipment for a new contract.</p>

      <div className="rounded-lg border border-line bg-white p-5">
        <AmcContractForm onSaved={(c) => router.push(`/dashboard/admin/amc-contracts/${c.id}`)} />
      </div>
    </div>
  );
}
