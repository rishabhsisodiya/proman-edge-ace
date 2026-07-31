"use client";

import { useEffect, useRef, useState } from "react";

export interface SearchOption {
  id: string;
  label: string;
}

interface SearchMultiSelectProps {
  label: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  /** Static option list (client-side filtered) — use for small lists like ASM/Engineer. */
  options?: SearchOption[];
  /** Async search (server-side) — use for large lists like Customers. Debounced internally. */
  fetchOptions?: (query: string) => Promise<SearchOption[]>;
}

/**
 * Search-and-select combobox for report ID filters (ASM/Engineer/Customer) —
 * replaces plain "paste a UUID" text inputs. Supports multiple selections
 * (chips); the caller joins selected ids with commas for the backend's
 * comma-separated `in` filter (see reports.service.ts's idFilter helper).
 */
export default function SearchMultiSelect({ label, selected, onChange, placeholder, options, fetchOptions }: SearchMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchOption[]>(options ?? []);
  const [labelById, setLabelById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Track labels for already-selected chips even after the option list changes.
  useEffect(() => {
    setLabelById((prev) => {
      const next = { ...prev };
      for (const o of results) next[o.id] = o.label;
      for (const o of options ?? []) next[o.id] = o.label;
      return next;
    });
  }, [results, options]);

  useEffect(() => {
    if (options) {
      setResults(query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options);
      return;
    }
    if (!fetchOptions) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      fetchOptions(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, options]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s !== id));
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <div
        onClick={() => setOpen(true)}
        className="flex min-h-9 w-56 flex-wrap items-center gap-1 rounded-md border border-line px-2 py-1 text-xs"
      >
        {selected.map((id) => (
          <span key={id} className="flex items-center gap-1 rounded bg-navy-tint px-2 py-0.5 text-navy">
            {labelById[id] ?? id}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(id);
              }}
              className="text-muted hover:text-brand-red"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? (placeholder ?? "Search…") : ""}
          className="min-w-[60px] flex-1 border-0 p-0.5 text-xs text-navy outline-none"
        />
      </div>

      {open && (query || options) && (
        <div className="absolute z-10 mt-1 max-h-56 w-56 overflow-y-auto rounded-md border border-line bg-white shadow-md">
          {loading && <p className="px-3 py-2 text-xs text-muted">Searching…</p>}
          {!loading && results.length === 0 && <p className="px-3 py-2 text-xs text-muted">No matches.</p>}
          {!loading &&
            results.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={`block w-full px-3 py-2 text-left text-xs hover:bg-navy-soft ${
                  selected.includes(o.id) ? "bg-navy-tint font-medium text-navy" : "text-navy"
                }`}
              >
                {selected.includes(o.id) ? "✓ " : ""}
                {o.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
