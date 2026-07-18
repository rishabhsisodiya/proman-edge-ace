// Indian FY: April – March. Mirrors the backend's currentFiscalYearRange() in
// dispatchServiceDB.ts / procurementServiceDB.ts / financeServiceDB.ts / storesServiceDB.ts.

export interface FiscalYearOption {
  startYear: number
  label: string   // e.g. "FY 2025-26"
  fyStart: string // YYYY-04-01
  fyEnd: string   // (YYYY+1)-03-31
}

export function currentFiscalYearStart(asOf: Date = new Date()): number {
  return asOf.getMonth() >= 3 ? asOf.getFullYear() : asOf.getFullYear() - 1
}

export function fiscalYearRange(startYear: number): { fyStart: string; fyEnd: string } {
  return { fyStart: `${startYear}-04-01`, fyEnd: `${startYear + 1}-03-31` }
}

// Last 5 FYs (current + 4 prior), most recent first.
export function lastFiveFiscalYears(asOf: Date = new Date()): FiscalYearOption[] {
  const current = currentFiscalYearStart(asOf)
  return Array.from({ length: 5 }, (_, i) => {
    const startYear = current - i
    const { fyStart, fyEnd } = fiscalYearRange(startYear)
    return { startYear, label: `FY ${startYear}-${String(startYear + 1).slice(-2)}`, fyStart, fyEnd }
  })
}
