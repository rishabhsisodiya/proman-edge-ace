"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createHoliday,
  deleteHoliday,
  downloadHolidayTemplate,
  Holiday,
  HolidayUploadResult,
  listHolidays,
  uploadHolidays,
} from "@/lib/ticketing/holidays";

// Holiday list (2026-07-30, FSD §14.3 note — "public holidays excluded,
// holiday list configurable by Admin") — one-off literal dates, bulk-
// uploaded via CSV once a year (download template, fill in Excel, re-
// upload), with individual add/remove for one-off corrections through the
// year. Read by addBusinessHours() to skip these dates like weekly off-days.
export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<HolidayUploadResult | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listHolidays()
      .then(setHolidays)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load holidays.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onAdd() {
    if (!date || !label.trim()) {
      setError("Date and label are both required.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await createHoliday(date, label.trim());
      setDate("");
      setLabel("");
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError("A holiday is already set for this date.");
      else setError("Could not add this holiday.");
    } finally {
      setAdding(false);
    }
  }

  async function onRemove(id: string) {
    setBusyId(id);
    try {
      await deleteHoliday(id);
      load();
    } catch {
      setError("Could not remove this holiday.");
    } finally {
      setBusyId(null);
    }
  }

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadResult(null);
    try {
      setUploadResult(await uploadHolidays(file));
      setFile(null);
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        setError(Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Upload failed.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Holidays</h1>
      <p className="mb-6 text-sm text-muted">
        Dates excluded from the business-hours SLA clock (08:00–18:00, Mon–Sat), on top of the weekly
        off-day. Upload the full year's list at once, or add/remove individual dates as needed.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <div className="mb-6 rounded-lg border border-line bg-white p-4 text-sm">
        <p className="mb-2 font-bold text-navy">Bulk upload (once a year)</p>
        <p className="mb-3 text-muted">
          Download the template, fill it in (columns: <code className="text-xs">date</code>,{" "}
          <code className="text-xs">label</code>), and upload it back here. Dates already on the list are
          skipped and reported, not treated as an error.
        </p>
        <button type="button" onClick={downloadHolidayTemplate} className="mb-3 text-xs font-bold text-navy underline">
          Download CSV template
        </button>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            type="button"
            disabled={!file || uploading}
            onClick={onUpload}
            className="rounded-md bg-orange px-4 py-2 text-xs font-bold text-navy disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>

        {uploadResult && (
          <div className="mt-3">
            <p className="mb-2 text-xs font-bold text-navy">
              {uploadResult.succeeded} of {uploadResult.total} rows added · {uploadResult.failed} skipped
            </p>
            {uploadResult.failed > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border border-line">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-line">
                    {uploadResult.results
                      .filter((r) => r.error)
                      .map((r) => (
                        <tr key={r.row}>
                          <td className="px-2 py-1 text-muted">Row {r.row}</td>
                          <td className="px-2 py-1 text-brand-red">{r.error}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-lg border border-line bg-white p-4 text-sm">
        <p className="mb-2 font-bold text-navy">Add a single date</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-navy">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-md border border-line px-2 text-sm text-navy"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-bold text-navy">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Independence Day"
              className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy"
            />
          </div>
          <button
            type="button"
            disabled={adding}
            onClick={onAdd}
            className="h-9 rounded-md bg-orange px-4 text-xs font-bold text-navy disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-navy-tint text-left text-xs font-bold uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-2 text-navy">{new Date(h.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-4 py-2 text-navy">{h.label}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => onRemove(h.id)}
                      disabled={busyId === h.id}
                      className="text-xs font-bold text-brand-red disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {holidays.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted">
                    No holidays configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
