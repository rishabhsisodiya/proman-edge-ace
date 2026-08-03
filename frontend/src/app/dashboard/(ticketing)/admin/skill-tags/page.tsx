"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { createSkillTag, deleteSkillTag, listSkillTags, SkillTagRow } from "@/lib/ticketing/skill-tags";

// Skill Tags master list (2026-08-03, client-agreed scope) — unrelated to
// Billing Rates/Engineer Level (client clarification: skill tags describe
// what an engineer can do, engineer level determines their billing rate,
// two separate concerns). No hard-delete safety net needed beyond a confirm
// — User.skillTags is a plain string array, not a real FK, so removing a
// tag here never breaks a user record, it just makes that string
// unselectable going forward.
export default function SkillTagsPage() {
  const [rows, setRows] = useState<SkillTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listSkillTags()
      .then(setRows)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load skill tags.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onCreate() {
    const label = newLabel.trim();
    if (!label) return;
    setCreating(true);
    setError(null);
    try {
      await createSkillTag(label);
      setNewLabel("");
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        setError(Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Could not add skill tag.");
      } else {
        setError("Could not add skill tag.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(row: SkillTagRow) {
    if (!confirm(`Remove "${row.label}"? Any engineer currently tagged with it keeps the tag on their profile, but it won't be selectable going forward.`)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await deleteSkillTag(row.id);
      load();
    } catch {
      setError("Could not remove this skill tag.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Skill Tags</h1>
      <p className="mb-6 text-sm text-muted">
        Master list of skill tags Admin can assign to Engineers on User Management. Unrelated to Engineer Level/Billing
        Rates — this is what an engineer can do, not what they&apos;re paid.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <div className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white p-3">
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">New skill tag</label>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. HYDRAULICS"
            disabled={creating}
            className="h-9 w-64 rounded-md border border-line px-3 text-sm text-navy disabled:opacity-50"
          />
        </div>
        <button
          onClick={onCreate}
          disabled={creating}
          className="h-9 rounded-md bg-orange px-4 text-sm font-bold text-navy disabled:opacity-50"
        >
          {creating ? "Adding…" : "+ Add Skill Tag"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">No skill tags yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-navy">{r.label}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onDelete(r)}
                      disabled={deletingId === r.id}
                      className="text-xs font-bold text-brand-red disabled:opacity-50"
                    >
                      {deletingId === r.id ? "Removing…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
