// Ticket-table tags column (client request, 2026-08-04) — show the first 2
// tags, truncate the rest behind a "+N" badge. Hovering the badge reveals
// the full remaining list via the native title tooltip, so nothing's fully
// hidden, just out of the way.
export function TagsCell({ tags }: { tags: string[] | undefined }) {
  if (!tags || tags.length === 0) return <span className="text-muted">—</span>;

  const visible = tags.slice(0, 2);
  const rest = tags.slice(2);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((tag) => (
        <span key={tag} className="rounded-full bg-navy-soft px-2 py-0.5 text-[10px] font-bold text-navy">
          {tag}
        </span>
      ))}
      {rest.length > 0 && (
        <span
          title={rest.join(", ")}
          className="rounded-full bg-navy-tint px-2 py-0.5 text-[10px] font-bold text-navy"
        >
          +{rest.length}
        </span>
      )}
    </div>
  );
}
