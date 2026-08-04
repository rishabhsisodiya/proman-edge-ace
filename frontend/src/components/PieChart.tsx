"use client";

// Minimal CSS conic-gradient pie chart — no charting library added just for
// the FSD's "regional pie charts (×6)" requirement (§10.1 W-05 Manager
// Dashboard). One slice per segment, proportional to its share of total.
const PALETTE = [
  "#2A2F69", // navy
  "#F2994A", // orange
  "#27AE60", // green
  "#EB5757", // red
  "#F2C94C", // amber
  "#2F80ED", // blue
  "#9B51E0", // purple
  "#56CCF2", // light blue
  "#BB6BD9", // lavender
  "#828282", // gray
];

export interface PieSlice {
  label: string;
  value: number;
}

export function PieChart({ slices, size = 120 }: { slices: PieSlice[]; size?: number }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);

  if (total === 0) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded-full border border-line text-[10px] text-muted"
      >
        No data
      </div>
    );
  }

  let cumulative = 0;
  const stops = slices.map((sl, i) => {
    const start = (cumulative / total) * 360;
    cumulative += sl.value;
    const end = (cumulative / total) * 360;
    return `${PALETTE[i % PALETTE.length]} ${start}deg ${end}deg`;
  });

  return (
    <div className="flex items-center gap-3">
      <div
        style={{ width: size, height: size, background: `conic-gradient(${stops.join(", ")})` }}
        className="shrink-0 rounded-full"
      />
      <div className="space-y-0.5">
        {slices.map((sl, i) => (
          <div key={sl.label} className="flex items-center gap-1.5 text-[11px] text-navy">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span>
              {sl.label} ({sl.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
