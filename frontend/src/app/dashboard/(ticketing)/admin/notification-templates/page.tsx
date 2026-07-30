"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  listNotificationTemplates,
  NotificationTemplate,
  updateNotificationTemplate,
} from "@/lib/ticketing/notification-templates";

// Sample values for the merge-field preview (FSD screen W-23: "Preview with
// sample merge fields") — purely illustrative, not tied to any real ticket.
const SAMPLE_VARS: Record<string, string> = {
  ticket_no: "TCKT-2026-005123",
  equipment_model: "JC-900 Jaw Crusher",
  site_name: "Prithvi Stone Industries — Plant 2",
  service_type: "Breakdown",
  priority: "HIGH",
  customer_name: "Prithvi Stone Industries",
  engineer_name: "Rahul Sharma",
  visit_date: "2026-08-02",
  rejection_reason: "Not available in territory",
  pending_reason: "Awaiting Parts",
  quotation_no: "QUOT-2026-000456",
  grand_total: "48,500",
  valid_until: "2026-08-15",
  status: "WORKING",
  sla_response_due: "2026-07-30 14:00",
  sla_resolution_due: "2026-07-31 18:00",
};

function fillPreview(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_VARS[key] ?? `{{${key}}}`);
}

const CHANNEL_LABEL: Record<string, string> = { EMAIL: "Email", SMS: "SMS", WHATSAPP: "WhatsApp", PUSH: "Push" };
const CHANNEL_STYLE: Record<string, string> = {
  EMAIL: "bg-navy-tint text-navy",
  WHATSAPP: "bg-brand-green-bg text-brand-green",
  PUSH: "bg-brand-amber-bg text-brand-amber",
  SMS: "bg-navy-soft text-muted",
};

// Notification Templates (2026-07-30, FSD §5.2 + screen W-23) — Admin edits
// per-event, per-channel content with {{merge_field}} placeholders, substituted
// for real values by NotificationTemplateService.render() at send time.
// Accordion layout (2026-07-30 redesign, client feedback: "too cluttered") —
// one trigger open at a time, collapsed by default.
export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [openTrigger, setOpenTrigger] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function load() {
    setLoading(true);
    setError(null);
    listNotificationTemplates()
      .then((data) => {
        setTemplates(data);
        const d: Record<string, { subject: string; body: string }> = {};
        for (const t of data) d[t.id] = { subject: t.subject ?? "", body: t.body };
        setDrafts(d);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load notification templates.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const grouped = useMemo(() => {
    const byTrigger = new Map<string, NotificationTemplate[]>();
    for (const t of templates) {
      const list = byTrigger.get(t.triggerCode) ?? [];
      list.push(t);
      byTrigger.set(t.triggerCode, list);
    }
    let entries = [...byTrigger.entries()].sort(([a], [b]) => a.localeCompare(b));
    const q = search.trim().toLowerCase();
    if (q) {
      entries = entries.filter(
        ([code, rows]) => code.toLowerCase().includes(q) || rows[0].triggerName.toLowerCase().includes(q),
      );
    }
    return entries;
  }, [templates, search]);

  async function onSave(id: string) {
    const draft = drafts[id];
    if (!draft?.body.trim()) {
      setError("Body cannot be empty.");
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      await updateNotificationTemplate(id, { subject: draft.subject || undefined, body: draft.body });
      setSavedId(id);
      setTimeout(() => setSavedId(null), 2500);
      load();
    } catch {
      setError("Could not save this template.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Notification Templates</h1>
      <p className="mb-4 text-sm text-muted">
        Per-trigger, per-channel message content. Click a trigger to edit — use{" "}
        <code>{"{{merge_field}}"}</code> placeholders (e.g. <code>{"{{ticket_no}}"}</code>) for real values at send
        time.
      </p>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search triggers (e.g. N-01, ticket created)…"
        className="mb-4 h-9 w-full rounded-md border border-line px-3 text-sm text-navy placeholder:text-text-disabled"
      />

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-white">
          {grouped.map(([triggerCode, rows]) => {
            const isOpen = openTrigger === triggerCode;
            return (
              <div key={triggerCode}>
                <button
                  onClick={() => setOpenTrigger(isOpen ? null : triggerCode)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-navy-soft"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-muted">{triggerCode}</span>
                    <span className="text-sm font-bold text-navy">{rows[0].triggerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {rows.map((r) => (
                      <span key={r.id} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CHANNEL_STYLE[r.channel] ?? ""}`}>
                        {CHANNEL_LABEL[r.channel] ?? r.channel}
                      </span>
                    ))}
                    <span className="ml-1 text-muted">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-4 border-t border-line bg-navy-soft/40 p-4">
                    {rows.map((t) => {
                      const draft = drafts[t.id] ?? { subject: "", body: "" };
                      return (
                        <div key={t.id} className="rounded-md border border-line bg-white p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${CHANNEL_STYLE[t.channel] ?? ""}`}>
                              {CHANNEL_LABEL[t.channel] ?? t.channel}
                            </span>
                            {savedId === t.id && <span className="text-xs font-bold text-brand-green">✓ Saved</span>}
                          </div>

                          {t.subject !== null && (
                            <div className="mb-2">
                              <label className="mb-1 block text-xs font-bold text-navy">Subject</label>
                              <input
                                value={draft.subject}
                                onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: { ...d[t.id], subject: e.target.value } }))}
                                className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy"
                              />
                            </div>
                          )}

                          <label className="mb-1 block text-xs font-bold text-navy">Body</label>
                          <textarea
                            value={draft.body}
                            onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: { ...d[t.id], body: e.target.value } }))}
                            rows={3}
                            className="mb-2 w-full rounded-md border border-line px-2 py-1.5 text-sm text-navy"
                          />

                          <div className="mb-2 rounded-md bg-navy-soft p-2 text-xs text-muted">
                            <span className="font-bold text-navy">Preview: </span>
                            {draft.subject && <span className="italic">{fillPreview(draft.subject)} — </span>}
                            {fillPreview(draft.body)}
                          </div>

                          <button
                            onClick={() => onSave(t.id)}
                            disabled={savingId === t.id}
                            className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy disabled:opacity-50"
                          >
                            {savingId === t.id ? "Saving…" : "Save"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {grouped.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No triggers match your search.</p>}
        </div>
      )}
    </div>
  );
}
