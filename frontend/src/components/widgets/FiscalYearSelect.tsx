'use client'
import { font } from '@/lib/brand'
import { lastFiveFiscalYears } from '@/lib/fiscalYear'

// Ported verbatim from PROMAN/frontend/src/components/widgets/FiscalYearSelect.tsx.
// Styled to match the dark navy header pills (e.g. "Switch dashboard") this
// control sits next to on every dashboard's top bar.
export function FiscalYearSelect({
  value, onChange,
}: {
  value: number
  onChange: (startYear: number) => void
}) {
  const options = lastFiveFiscalYears()
  return (
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        font, fontSize: 11, fontWeight: 600, color: '#fff',
        background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)',
        borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
      }}
    >
      {options.map(o => (
        <option key={o.startYear} value={o.startYear} style={{ color: '#1a1a2e' }}>{o.label}</option>
      ))}
    </select>
  )
}
