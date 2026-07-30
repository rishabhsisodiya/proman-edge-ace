"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { bulkImportTickets, BulkImportResult } from "@/lib/ticketing/actions";

const TEMPLATE_CSV =
  "source,description,customerErpId,equipmentSerialNo,serviceType,priority,subject\n" +
  "CUSTOMER_CALL,Crusher making unusual noise during operation,ACME-CUST-001,SN-JC900-0042,BREAKDOWN_CHARGEABLE,HIGH,\n" +
  "CUSTOMER_WHATSAPP,Routine service request,ACME-CUST-002,,,MEDIUM,\n";

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ticket-bulk-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Bulk CSV ticket import (Build Plan Days 4-10, T1) — reuses the same
// CreateTicket engine as every other source (dedup/auto-routing/priority
// matrix all apply identically), just a new entry point into it.
export default function BulkImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  async function onSubmit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await bulkImportTickets(file));
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        setError(Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Import failed.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-6 px-6 py-10">
      <div>
        <h1 className="text-xl font-bold text-navy">Bulk Ticket Import</h1>
        <p className="mt-1 text-sm text-muted">
          Upload a CSV of ticket rows. Valid rows create tickets through the same rules as any other
          source; invalid rows are reported individually — nothing silently fails.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-white p-4 text-sm">
        <p className="mb-2 font-bold text-navy">Required columns</p>
        <p className="text-muted">
          <code className="text-xs">source</code>, <code className="text-xs">description</code>, and{" "}
          <code className="text-xs">customerErpId</code> — the customer's ID as it already appears in
          ERPNext, not an internal system ID.
        </p>
        <p className="mt-2 mb-2 font-bold text-navy">Optional columns</p>
        <p className="mb-3 text-muted">
          <code className="text-xs">serviceType</code>, <code className="text-xs">priority</code>,{" "}
          <code className="text-xs">subject</code>, and <code className="text-xs">equipmentSerialNo</code> — the
          equipment's serial number.
        </p>
        <button type="button" onClick={downloadTemplate} className="text-xs font-bold text-navy underline">
          Download CSV template
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          type="button"
          disabled={!file || busy}
          onClick={onSubmit}
          className="rounded-md bg-orange px-4 py-2 text-sm font-bold text-navy disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </div>

      {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-sm text-brand-red">{error}</p>}

      {result && (
        <div>
          <p className="mb-2 text-sm font-bold text-navy">
            {result.succeeded} of {result.total} rows created · {result.failed} failed
          </p>
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead className="bg-navy-tint text-left text-xs font-bold uppercase text-muted">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.results.map((r) => (
                  <tr key={r.row}>
                    <td className="px-3 py-2 text-navy">{r.row}</td>
                    <td className={`px-3 py-2 ${r.error ? "text-brand-red" : "text-brand-green"}`}>
                      {r.error ?? `Created ${r.ticketNo}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
