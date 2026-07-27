"use client";

export function SortableTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <th className="px-4">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 font-bold uppercase tracking-wider ${active ? "text-white" : "text-white/80 hover:text-white"}`}
      >
        {label}
        <span className="text-[9px]">{active ? (currentDir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}
