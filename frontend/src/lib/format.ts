/** Shared rupee formatting — Cr / L / K compact notation, trailing zeros stripped, max 2 decimals. */

function trimDecimals(n: number, maxDecimals: number): string {
  return n.toFixed(maxDecimals).replace(/\.?0+$/, '')
}

export function formatMoney(value: number | string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1_00_00_000) return `${sign}₹${trimDecimals(abs / 1_00_00_000, 2)}Cr`
  if (abs >= 1_00_000)    return `${sign}₹${trimDecimals(abs / 1_00_000, 1)}L`
  if (abs >= 1_000)       return `${sign}₹${trimDecimals(abs / 1_000, 1)}K`
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`
}
