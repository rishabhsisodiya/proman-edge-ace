"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  generatePartnerApiKey,
  listPartnerApiKeys,
  PartnerApiKey,
  revokePartnerApiKey,
} from "@/lib/ticketing/partner-api-keys";

// Admin-managed Partner/IoT API keys (Build Plan Phase 2 item 7) — generate a
// key to hand to a partner system, revoke it later if needed. The raw key is
// shown exactly once at creation; only its hash is ever stored server-side.
export default function PartnerApiKeysPage() {
  const [keys, setKeys] = useState<PartnerApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<{ label: string; rawKey: string } | null>(null);

  function load() {
    listPartnerApiKeys().then(setKeys).catch(() => setKeys([]));
  }
  useEffect(load, []);

  async function onGenerate() {
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await generatePartnerApiKey(label.trim());
      setJustCreated({ label: created.label, rawKey: created.rawKey });
      setLabel("");
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        setError(Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Could not generate key.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (!confirm("Revoke this key? Anything using it will immediately stop working.")) return;
    await revokePartnerApiKey(id);
    load();
  }

  return (
    <div className="w-full space-y-6 px-6 py-10">
      <div>
        <h1 className="text-xl font-bold text-navy">Partner API Keys</h1>
        <p className="mt-1 text-sm text-muted">
          Generate a key to hand to a partner/IoT system so it can create tickets via{" "}
          <code className="text-xs">POST /webhooks/ticket-sources</code> (header{" "}
          <code className="text-xs">X-API-Key</code>). Revoke a key here any time to cut off access
          immediately — no code change or restart needed.
        </p>
      </div>

      {justCreated && (
        <div className="rounded-lg border border-brand-amber bg-brand-amber-bg p-4">
          <p className="text-sm font-bold text-navy">
            Key "{justCreated.label}" created — copy it now, it won't be shown again:
          </p>
          <code className="mt-2 block break-all rounded-md bg-white px-3 py-2 text-xs text-navy">
            {justCreated.rawKey}
          </code>
        </div>
      )}

      {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-sm text-brand-red">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Acme IoT sensor gateway)"
          className="h-10 flex-1 rounded-md border border-line px-3 text-sm text-navy"
        />
        <button
          type="button"
          disabled={!label.trim() || busy}
          onClick={onGenerate}
          className="h-10 rounded-md bg-orange px-4 text-sm font-bold text-navy disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate Key"}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-navy-tint text-left text-xs font-bold uppercase text-muted">
            <tr>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted">
                  No keys yet.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="px-3 py-2 text-navy">{k.label}</td>
                <td className="px-3 py-2 text-muted">{new Date(k.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-muted">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}</td>
                <td className="px-3 py-2">
                  {k.revokedAt ? (
                    <span className="text-xs font-bold text-brand-red">Revoked</span>
                  ) : (
                    <span className="text-xs font-bold text-brand-green">Active</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {!k.revokedAt && (
                    <button type="button" onClick={() => onRevoke(k.id)} className="text-xs font-bold text-brand-red underline">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
