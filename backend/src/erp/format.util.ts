// Ported verbatim from PROMAN/backend/src/lib/format.ts — shared across all
// dashboard modules (Sales, Finance, Procurement, Stores, Dispatch all use
// `rupees`).

function trimDecimals(n: number, maxDecimals: number): string {
  return n.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

export function rupees(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 10_000_000) return `${sign}₹${trimDecimals(abs / 10_000_000, 2)}Cr`;
  if (abs >= 100_000) return `${sign}₹${trimDecimals(abs / 100_000, 1)}L`;
  if (abs >= 1_000) return `${sign}₹${trimDecimals(abs / 1_000, 1)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

export function statusToDirection(status: string): 'up' | 'dn' | 'neu' {
  if (status === 'green') return 'up';
  if (status === 'red') return 'dn';
  return 'neu';
}

export function statusToColor(status: string, key: string): string {
  const COLOR_MAP: Record<string, string> = {
    enquiries_mtd: '#1A4A8A',
    quotations_open: '#854F0B',
    orders_confirmed: '#1A6B3A',
    conversion_rate: '#A32D2D',
    revenue_mtd: '#C2410C',
  };
  return COLOR_MAP[key] ?? '#1A4A8A';
}

export function dateLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
