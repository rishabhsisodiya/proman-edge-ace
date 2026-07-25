"use client";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <p className="text-xs text-muted">
        Page {page} of {totalPages} · {total} ticket{total === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-bold text-navy disabled:opacity-40"
        >
          Prev
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-bold text-navy disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
