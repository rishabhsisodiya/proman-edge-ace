"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { listPredictiveRules, PredictiveRuleConfig, updatePredictiveRule } from "@/lib/ticketing/predictive-rules";
import { EQUIP_CATEGORY_LABEL, EquipCategory } from "@/lib/ticketing/equipment-admin";

interface Draft {
  monthsSinceService: string;
  operatingHoursInterval: string;
  breakdownFrequencyThreshold: string;
  breakdownFrequencyWindowMonths: string;
}

// Predictive Rules (2026-07-31, FSD §7.4) — per-equipment-category
// thresholds for all 3 rule-based predictive triggers. Breakdown frequency
// (client request, 2026-07-31) is made configurable here too, per-category —
// a superset of the FSD's literal wording (which only calls out the other
// two as "configured per equipment_category"), not a deviation from it.
export default function PredictiveRulesPage() {
  const [rules, setRules] = useState<PredictiveRuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [showInfo, setShowInfo] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listPredictiveRules()
      .then((data) => {
        setRules(data);
        const d: Record<string, Draft> = {};
        for (const r of data)
          d[r.id] = {
            monthsSinceService: String(r.monthsSinceService),
            operatingHoursInterval: String(r.operatingHoursInterval),
            breakdownFrequencyThreshold: String(r.breakdownFrequencyThreshold),
            breakdownFrequencyWindowMonths: String(r.breakdownFrequencyWindowMonths),
          };
        setDrafts(d);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load predictive rules.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onSave(rule: PredictiveRuleConfig) {
    const draft = drafts[rule.id];
    const monthsSinceService = Number(draft?.monthsSinceService);
    const operatingHoursInterval = Number(draft?.operatingHoursInterval);
    const breakdownFrequencyThreshold = Number(draft?.breakdownFrequencyThreshold);
    const breakdownFrequencyWindowMonths = Number(draft?.breakdownFrequencyWindowMonths);
    if (
      !monthsSinceService || monthsSinceService < 1 ||
      !operatingHoursInterval || operatingHoursInterval < 1 ||
      !breakdownFrequencyThreshold || breakdownFrequencyThreshold < 1 ||
      !breakdownFrequencyWindowMonths || breakdownFrequencyWindowMonths < 1
    ) {
      setError("All values must be positive numbers.");
      return;
    }
    setSavingId(rule.id);
    setError(null);
    try {
      await updatePredictiveRule(rule.id, monthsSinceService, operatingHoursInterval, breakdownFrequencyThreshold, breakdownFrequencyWindowMonths);
      load();
    } catch {
      setError("Could not save this rule.");
    } finally {
      setSavingId(null);
    }
  }

  function updateDraft(id: string, field: keyof Draft, value: string) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-navy">Predictive Rules</h1>
        <button
          onClick={() => setShowInfo(true)}
          className="rounded-full border border-line px-2.5 py-0.5 text-xs font-bold text-navy transition hover:bg-navy-tint"
        >
          How this works
        </button>
      </div>
      <p className="mb-6 text-sm text-muted">
        Per-equipment-category thresholds for all 3 predictive maintenance triggers.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                <th className="px-4 py-3">Equipment Category</th>
                <th className="px-4 py-3">Months Since Last Service</th>
                <th className="px-4 py-3">Operating Hours Interval</th>
                <th className="px-4 py-3">Breakdown Count Threshold</th>
                <th className="px-4 py-3">Breakdown Window (months)</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const draft = drafts[rule.id] ?? {
                  monthsSinceService: "",
                  operatingHoursInterval: "",
                  breakdownFrequencyThreshold: "",
                  breakdownFrequencyWindowMonths: "",
                };
                const busy = savingId === rule.id;
                return (
                  <tr key={rule.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap text-navy">
                      {EQUIP_CATEGORY_LABEL[rule.equipmentCategory as EquipCategory] ?? rule.equipmentCategory}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={1}
                        value={draft.monthsSinceService}
                        disabled={busy}
                        onChange={(e) => updateDraft(rule.id, "monthsSinceService", e.target.value)}
                        className="h-8 w-20 rounded-md border border-line px-2 text-xs text-navy disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={1}
                        value={draft.operatingHoursInterval}
                        disabled={busy}
                        onChange={(e) => updateDraft(rule.id, "operatingHoursInterval", e.target.value)}
                        className="h-8 w-24 rounded-md border border-line px-2 text-xs text-navy disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={1}
                        value={draft.breakdownFrequencyThreshold}
                        disabled={busy}
                        onChange={(e) => updateDraft(rule.id, "breakdownFrequencyThreshold", e.target.value)}
                        className="h-8 w-20 rounded-md border border-line px-2 text-xs text-navy disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={1}
                        value={draft.breakdownFrequencyWindowMonths}
                        disabled={busy}
                        onChange={(e) => updateDraft(rule.id, "breakdownFrequencyWindowMonths", e.target.value)}
                        className="h-8 w-20 rounded-md border border-line px-2 text-xs text-navy disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => onSave(rule)} disabled={busy} className="text-xs font-bold text-navy disabled:opacity-50">
                        {busy ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}

function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-navy">How Predictive Rules Work</h3>
          <button onClick={onClose} className="text-xs font-bold text-muted">
            Close
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <section>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">The 3 Rules</p>
            <p className="mb-1 text-muted">
              Checked daily at 3 AM IST, against every active equipment record:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-navy">
              <li>
                <span className="font-bold">Time since last service</span> — no submitted Field Service Visit within
                the configured months → <span className="text-muted">Technical Audit ticket, Medium priority.</span>
              </li>
              <li>
                <span className="font-bold">Breakdown frequency</span> — N+ chargeable Breakdown tickets within the
                configured window (default 3 in 6 months) →{" "}
                <span className="text-muted">Technical Audit ticket, High priority.</span>
              </li>
              <li>
                <span className="font-bold">Operating hours interval</span> — the equipment's meter{" "}
                <span className="italic">crosses</span> the configured interval (e.g. every 500 hrs), not just
                "is above" it — a plain "above" check would recreate the ticket every single day once past the
                threshold →{" "}
                <span className="text-muted">Scheduled PM ticket, High priority.</span>
              </li>
            </ul>
          </section>

          <section>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">Admin-Configurable Values</p>
            <p className="text-muted">
              Every threshold in the table above is set per Equipment Category (8 categories), not fixed in code —
              months-since-service, hours-interval, breakdown-count-threshold, and breakdown-window-months. Save a row
              to change it; takes effect on the next daily run.
            </p>
          </section>

          <section>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">Duplicate Guard</p>
            <p className="text-muted">
              Rules 1 and 2 both create a Technical Audit ticket — if one's already open for a piece of equipment,
              the other rule won't create a second (breakdown frequency is checked first, being the more severe
              cause). Rule 3 has its own equivalent guard against an already-open Scheduled PM predictive ticket.
              This prevents the same equipment from piling up duplicate tickets while one is still being worked.
            </p>
          </section>

          <section>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-navy">Notification</p>
            <p className="text-muted">
              Predictive tickets skip the normal "ticket created" customer/ASM messages (N-01/N-02) — instead they
              fire the FSD's dedicated N-22 trigger, sent to the equipment's owning ASM plus every Manager covering
              that customer's region.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
