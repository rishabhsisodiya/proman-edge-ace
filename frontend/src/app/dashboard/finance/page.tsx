'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useFinanceHomepage, releasePayment, approvePurchaseOrder, approveJournalEntry } from '@/hooks/useFinanceHomepage'
import { useFinanceSettings, setGmTarget, clearGmTargetOverride } from '@/hooks/useFinanceSettings'
import { FiscalYearSelect } from '@/components/widgets/FiscalYearSelect'
import { currentFiscalYearStart } from '@/lib/fiscalYear'
import { colors } from '@/lib/brand'
import { formatMoney } from '@/lib/format'
import type { SparkPoint, PeriodStat, TopDebtor, PayablesInvoiceRow, GrossMarginStat } from '@/types/finance'

// Ported verbatim from PROMAN/frontend/src/app/home/finance-head/page.tsx
// (client-approved design — do not restyle). Plumbing changes only: hook
// import paths (dashboardsApi/cookie auth via useFinanceHomepage etc.), the
// dashboard-switcher is now a flat list (no per-role map, since our
// /auth/me doesn't return roleSlug) with /dashboard/* routes, and the
// logout handler uses our real cookie names + /login.

// ── Design tokens (shared visual language with other homepages) ─────────────
const NAVY      = colors.navy
const NAVY_TINT = colors.navyTint
const ORANGE    = colors.orange
const BG        = colors.navySoft
const BORDER    = colors.border
const INK       = colors.textPrimary
const INK2      = colors.textSecondary
const INK3      = colors.textDisabled
const GREEN     = colors.success
const AMBER     = colors.warning
const RED       = colors.error
const RED_BG    = colors.errorBg
const AMBER_BG  = colors.warningBg

const fmtMoney = formatMoney

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const BUCKET_COLOR: Record<string, string> = {
  '0-30': GREEN, '31-60': AMBER, '61-90': ORANGE, '90+': RED, 'Advance / credit': INK2,
}

// Known 5 entities (per the design template). Only entries with a `match` are
// backed by real, reachable DB data today — the rest render an explicit
// "no data yet" state rather than a fake filtered result.
const ENTITY_LABELS = ['PISPL', 'ACE', 'PROMAX', 'QMS Pro', 'Dynatek'] as const
const ENTITY_MATCH: Record<string, string | undefined> = {
  PISPL: 'Proman Infrastructure Services Private Limited',
  ACE: 'ACE',
  PROMAX: 'PROMAX',
  'QMS Pro': 'QMS Pro',
  Dynatek: 'Dynatek',
}

// ACE/PROMAX/QMS Pro/Dynatek are Tally-only today (no DB access, data comes from the client's
// xlsx sheets) but each is expected to get its own ERPNext/Frappe site eventually, per the
// project's Sites Reference. Per-site URL below, so "View all" always redirects somewhere —
// even 404 — rather than silently going to PISPL's site with a bogus company filter.
// ACE/PROMAX/QMS Pro domains are confirmed (project CLAUDE.md Sites Reference); Dynatek's isn't
// listed there yet (that table only has "Bluestone" as the 5th entity) — using the same naming
// convention as a placeholder until Shivam/the client confirms Dynatek's real site.
// Sourced from NEXT_PUBLIC_ERP_*_URL env vars (frontend/.env.local) rather than hardcoded here.
const ENTITY_ERP_BASE: Record<string, string> = {
  ACE: process.env.NEXT_PUBLIC_ERP_ACE_URL ?? 'https://ace.frappe.cloud',
  PROMAX: process.env.NEXT_PUBLIC_ERP_PROMAX_URL ?? 'https://promax.frappe.cloud',
  'QMS Pro': process.env.NEXT_PUBLIC_ERP_QMSPRO_URL ?? 'https://qmspro.frappe.cloud',
  Dynatek: process.env.NEXT_PUBLIC_ERP_DYNATEK_URL ?? 'https://dynatek.frappe.cloud',
}

// Resolves the ERP base URL to use for a given entity filter: PISPL uses the real, live
// base URL from the backend (data.erpBaseUrl); the other 4 use their own placeholder site.
function erpBaseForEntity(defaultBase: string, entityLabel: string | null): string {
  if (entityLabel && ENTITY_ERP_BASE[entityLabel]) return ENTITY_ERP_BASE[entityLabel]
  return defaultBase
}

function filterByLabel<T extends { entity: string }>(items: T[], label: string | null): { rows: T[]; unavailable: boolean } {
  if (!label) return { rows: items, unavailable: false }
  const match = ENTITY_MATCH[label]
  if (!match) return { rows: [], unavailable: true }
  return { rows: items.filter(i => i.entity === match), unavailable: false }
}

const ENTITY_SHORT_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(ENTITY_MATCH).filter((e): e is [string, string] => !!e[1]).map(([short, full]) => [full, short])
)
function shortEntity(name: string): string {
  return ENTITY_SHORT_LABEL[name] ?? name
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Card({ title, icon, right, children }: { title: React.ReactNode; icon: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '15px 16px', boxShadow: '0 1px 2px rgba(42,47,105,.05), 0 4px 12px rgba(42,47,105,.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 12.5, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
          <i className={`ti ${icon}`} style={{ color: ORANGE, fontSize: 15 }} />{title}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

function EntityFilterBar({ active, onSelect }: { active: string | null; onSelect: (label: string | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 10, marginTop: 2, borderTop: `1px solid ${BORDER}` }}>
      <button onClick={() => onSelect(null)} style={pillStyle(active === null)}>All entities</button>
      {ENTITY_LABELS.map(label => (
        <button key={label} onClick={() => onSelect(label)} style={pillStyle(active === label)}>{label}</button>
      ))}
    </div>
  )
}

function pillStyle(on: boolean): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, padding: '5px 11px', borderRadius: 99,
    border: `1px solid ${on ? NAVY : BORDER}`, background: on ? NAVY : '#fff',
    color: on ? '#fff' : NAVY, cursor: 'pointer',
  }
}

function BlockedState({ reason }: { reason: string }) {
  return (
    <div style={{ fontSize: 11, color: INK2, background: BG, borderRadius: 10, padding: '16px 14px', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
      <i className="ti ti-tool" style={{ color: AMBER, fontSize: 16, flexShrink: 0, marginTop: 1 }} />
      <div><strong style={{ color: INK }}>Awaiting ERP setup.</strong> {reason}</div>
    </div>
  )
}

function NoDataForEntity({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 10.5, color: INK3, textAlign: 'center', padding: '14px 4px', fontStyle: 'italic' }}>
      No data yet for {label} — DB access for this site hasn&apos;t been set up.
    </div>
  )
}

function Sparkline({ points }: { points: SparkPoint[] }) {
  if (!points.length) return <div style={{ fontSize: 8.5, color: '#7E84B8', marginTop: 6 }}>No trend history yet</div>
  const max = Math.max(...points.map(p => Math.abs(p.value)), 1)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28, marginTop: 10 }}>
        {points.map((p, i) => (
          <div key={p.label + i} title={`${p.label}: ${fmtMoney(p.value)}`} style={{
            flex: 1, minHeight: 3, height: `${Math.max(8, Math.round(100 * Math.abs(p.value) / max))}%`,
            background: i === points.length - 1 ? ORANGE : 'rgba(255,255,255,.22)', borderRadius: '2px 2px 0 0',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {points.map((p, i) => (
          <span key={p.label + i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: '#7E84B8', fontFamily: 'monospace' }}>{p.label}</span>
        ))}
      </div>
    </div>
  )
}

function DebtorBar({ debtor }: { debtor: TopDebtor }) {
  const max = Math.max(debtor.buckets.reduce((s, b) => s + b.amount, 0), 1)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: INK }}>{debtor.customer}</span>
        <span style={{ fontFamily: 'monospace', color: INK2 }}>{fmtMoney(debtor.netReceivable)}</span>
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', background: BG }}>
        {debtor.buckets.map(b => (
          <div key={b.bucket} title={`${b.bucket}: ${fmtMoney(b.amount)}`} style={{ width: `${100 * b.amount / max}%`, background: BUCKET_COLOR[b.bucket] }} />
        ))}
      </div>
    </div>
  )
}

const URGENCY_COLOR = (daysAway: number) => daysAway <= 1 ? { bg: RED_BG, fg: RED } : daysAway <= 5 ? { bg: AMBER_BG, fg: AMBER } : { bg: BG, fg: NAVY }

const AQ_ERP_PATH = ['/app/purchase-invoice', '/app/journal-entry'] as const

// Per Shivam's v3 doc: bare paths, no extra filters — just the entity's site/company.
// Redirects to the selected entity's own ERP site (see erpBaseForEntity) — for ACE/PROMAX/
// QMS Pro/Dynatek that site may not exist yet (404), which is fine; better than silently
// pointing at PISPL's ERPNext with a bogus company filter.
function aqErpLinkFor(defaultBase: string, tab: 0 | 1, entityLabel: string | null): string {
  const base = erpBaseForEntity(defaultBase, entityLabel)
  const path = AQ_ERP_PATH[tab]
  const match = entityLabel ? ENTITY_MATCH[entityLabel] : undefined
  const qs = match ? `?company=${encodeURIComponent(match)}` : ''
  return `${base}${path}${qs}`
}

// Builds a "View all" link for a card, adding a company filter if a real entity is selected.
// pathWithQuery may already contain its own query string (e.g. the AP ageing-bucket params).
// Redirects to the selected entity's own ERP site — see aqErpLinkFor's comment above.
function cardErpLink(defaultBase: string, pathWithQuery: string, entityLabel: string | null): string {
  const base = erpBaseForEntity(defaultBase, entityLabel)
  const match = entityLabel ? ENTITY_MATCH[entityLabel] : undefined
  if (!match) return `${base}${pathWithQuery}`
  const sep = pathWithQuery.includes('?') ? '&' : '?'
  return `${base}${pathWithQuery}${sep}company=${encodeURIComponent(match)}`
}

function ViewAllBottom({ href }: { href: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
      <a href={href} target="_blank" rel="noreferrer" style={{
        fontSize: 10, fontWeight: 700, color: NAVY, border: `1px solid ${BORDER}`, background: '#fff',
        padding: '4px 10px', borderRadius: 99, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <i className="ti ti-external-link" style={{ fontSize: 13 }} />View all
      </a>
    </div>
  )
}

function groupInvoicesByDate(rows: PayablesInvoiceRow[]) {
  const byDate = new Map<string, PayablesInvoiceRow[]>()
  for (const r of rows) {
    if (!byDate.has(r.dueDate)) byDate.set(r.dueDate, [])
    byDate.get(r.dueDate)!.push(r)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function PeriodTabs({ period, onChange }: { period: 'M' | 'Q' | 'Y'; onChange: (p: 'M' | 'Q' | 'Y') => void }) {
  return (
    <span style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,.28)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
      {(['M', 'Q', 'Y'] as const).map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          fontSize: 9, fontWeight: 700, padding: '2px 8px', border: 'none',
          background: period === p ? ORANGE : 'transparent', color: period === p ? '#fff' : '#A9C2DC', cursor: 'pointer',
        }}>{p}</button>
      ))}
    </span>
  )
}

function PeriodTabsLight({ period, onChange }: { period: 'M' | 'Q' | 'Y'; onChange: (p: 'M' | 'Q' | 'Y') => void }) {
  return (
    <span style={{ display: 'inline-flex', border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
      {(['M', 'Q', 'Y'] as const).map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          fontSize: 9, fontWeight: 700, padding: '2px 8px', border: 'none',
          background: period === p ? NAVY : '#fff', color: period === p ? '#fff' : INK2, cursor: 'pointer',
        }}>{p}</button>
      ))}
    </span>
  )
}

function AqThead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr>
        {cols.map(c => (
          <th key={c} style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: INK2,
            textAlign: 'left', padding: '5px 8px 7px', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
          }}>{c}</th>
        ))}
      </tr>
    </thead>
  )
}

function AqTd({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: '7px 8px', borderBottom: `1px solid ${BORDER}`, color: INK, verticalAlign: 'middle', ...style }}>
      {children}
    </td>
  )
}

function Pill({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function SettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { settings, isLoading, refresh } = useFinanceSettings()
  const [defaultVal, setDefaultVal] = useState('')
  const [entityVal, setEntityVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!settings) return
    setDefaultVal(String(settings.grossMarginTargetPct.default))
  }, [settings])

  const pisplName = ENTITY_MATCH['PISPL']
  const pisplOverride = settings?.grossMarginTargetPct.byEntity[pisplName ?? '']

  useEffect(() => {
    setEntityVal(pisplOverride !== undefined ? String(pisplOverride) : '')
  }, [pisplOverride])

  async function saveDefault() {
    const n = Number(defaultVal)
    if (Number.isNaN(n) || n < 0 || n > 100) { setError('Enter a number between 0 and 100'); return }
    setError(''); setSaving(true)
    try { await setGmTarget(null, n); await refresh(); onSaved() } finally { setSaving(false) }
  }

  async function saveEntity() {
    if (!pisplName) return
    const n = Number(entityVal)
    if (Number.isNaN(n) || n < 0 || n > 100) { setError('Enter a number between 0 and 100'); return }
    setError(''); setSaving(true)
    try { await setGmTarget(pisplName, n); await refresh(); onSaved() } finally { setSaving(false) }
  }

  async function resetEntity() {
    if (!pisplName) return
    setSaving(true)
    try { await clearGmTargetOverride(pisplName); await refresh(); onSaved() } finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'absolute', right: 0, top: 34, width: 320, background: '#fff',
      border: `1px solid ${BORDER}`, borderRadius: 10,
      boxShadow: '0 12px 30px rgba(15,34,64,.18)', padding: 14, zIndex: 50,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h4 style={{ fontSize: 11, fontWeight: 700, color: INK, margin: 0 }}>Gross Margin Target</h4>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: INK3, fontSize: 14 }}>✕</button>
      </div>
      {isLoading || !settings
        ? <div style={{ fontSize: 11, color: INK2 }}>Loading…</div>
        : <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: INK2, display: 'block', marginBottom: 5 }}>Default (all entities)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" min={0} max={100} value={defaultVal} onChange={e => setDefaultVal(e.target.value)}
                  style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '5px 8px', fontSize: 11.5, width: 0 }} />
                <button onClick={saveDefault} disabled={saving} style={{
                  fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 7, border: 'none',
                  background: NAVY, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1,
                }}>Save</button>
              </div>
            </div>
            {pisplName && (
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: INK2, display: 'block', marginBottom: 5 }}>PISPL override</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" min={0} max={100} placeholder={String(settings.grossMarginTargetPct.default)} value={entityVal} onChange={e => setEntityVal(e.target.value)}
                    style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '5px 8px', fontSize: 11.5, width: 0 }} />
                  <button onClick={saveEntity} disabled={saving} style={{
                    fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 7, border: 'none',
                    background: NAVY, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1,
                  }}>Save</button>
                  {pisplOverride !== undefined && (
                    <button onClick={resetEntity} disabled={saving} title="Reset to default" style={{
                      fontSize: 10, fontWeight: 700, padding: '5px 9px', borderRadius: 7, border: `1px solid ${BORDER}`,
                      background: '#fff', color: INK2, cursor: 'pointer',
                    }}>↺</button>
                  )}
                </div>
              </div>
            )}
            <div style={{ fontSize: 9.5, color: INK3, marginTop: 10, fontStyle: 'italic' }}>
              ACE, PROMAX, QMS Pro, Dynatek overrides become available once those sites are DB-connected.
            </div>
            {error && <div style={{ fontSize: 10, color: RED, marginTop: 6 }}>{error}</div>}
          </>
      }
    </div>
  )
}

function GaugeRing({ pct, target, subLabel }: { pct: number | null; target: number; subLabel: string }) {
  const r = 42, c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct ?? 0))
  const color = pct === null ? INK3 : pct >= target ? GREEN : pct >= target - 5 ? AMBER : RED
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
      <div style={{ position: 'relative', width: 104, height: 104 }}>
        <svg viewBox="0 0 104 104" width="104" height="104" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="52" cy="52" r={r} fill="none" stroke={BG} strokeWidth="10" />
          <circle cx="52" cy="52" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - clamped / 100)} />
        </svg>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 21, color: INK }}>{pct === null ? '—' : `${pct}%`}</div>
          <div style={{ fontSize: 8.5, color: INK2, fontFamily: 'monospace', marginTop: 2 }}>{subLabel}</div>
        </div>
      </div>
      <div style={{ fontSize: 9, color: INK2 }}>vs {target}% target</div>
    </div>
  )
}

// Roles that can switch to other dashboards
const SWITCHER_OPTIONS: { label: string; slug: string }[] = [
  { label: 'Sales Head',         slug: 'sales'         },
  { label: 'Manufacturing Head', slug: 'manufacturing' },
  { label: 'Procurement Head',   slug: 'procurement'   },
  { label: 'Stores Head',        slug: 'stores'        },
  { label: 'Dispatch Head',      slug: 'dispatch'      },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinanceHeadPage() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [fyStartYear, setFyStartYear] = useState(currentFiscalYearStart())
  const { data, isLoading, isError, refresh } = useFinanceHomepage(fyStartYear)

  const [rcvEntity, setRcvEntity] = useState<string | null>(null)
  const [payEntity, setPayEntity] = useState<string | null>(null)
  const [poEntity, setPoEntity]   = useState<string | null>(null)
  const [aqEntity, setAqEntity]   = useState<string | null>(null)
  const [aqTab, setAqTab]         = useState<0 | 1>(0)
  const [revPeriod, setRevPeriod] = useState<'M' | 'Q' | 'Y'>('M')
  const [gstPeriod, setGstPeriod] = useState<'M' | 'Q' | 'Y'>('M')
  const [gmPeriod, setGmPeriod]   = useState<'M' | 'Q' | 'Y'>('M')
  const [releasingInvoice, setReleasingInvoice] = useState<string | null>(null)
  const [approvingPo, setApprovingPo] = useState<string | null>(null)
  const [approvingJe, setApprovingJe] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; link?: string } | null>(null)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [showNotif, setShowNotif]       = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)
  const notifRef    = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  const switcherOptions = SWITCHER_OPTIONS

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setShowSwitcher(false)
      if (notifRef.current    && !notifRef.current.contains(e.target as Node))    setShowNotif(false)
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const today    = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const syncTime = data ? new Date(data.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''

  async function handleRelease(invoiceNo: string) {
    setReleasingInvoice(invoiceNo)
    try {
      const result = await releasePayment(invoiceNo)
      if (result.ok && result.summary) {
        setToast({ text: `Draft ${result.summary.payment_entry} created for ${invoiceNo} — pick the bank account and submit in ERPNext.`, link: result.deep_link })
        refresh()
      } else {
        setToast({ text: `⚠ ${result.error?.message ?? 'Release failed'}` })
      }
    } catch (err) {
      setToast({ text: `⚠ ${err instanceof Error ? err.message : 'Release failed'}` })
    } finally {
      setReleasingInvoice(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  async function handleApprovePo(poNo: string) {
    setApprovingPo(poNo)
    try {
      const result = await approvePurchaseOrder(poNo)
      if (result.ok) {
        setToast({ text: `${poNo} advanced${result.summary?.name ? ` — now ${result.summary.name}` : ''}.`, link: result.deep_link })
        refresh()
      } else {
        setToast({ text: `⚠ ${result.error?.message ?? 'Approve failed'}` })
      }
    } catch (err) {
      setToast({ text: `⚠ ${err instanceof Error ? err.message : 'Approve failed'}` })
    } finally {
      setApprovingPo(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  async function handleApproveJe(jeNo: string) {
    setApprovingJe(jeNo)
    try {
      const result = await approveJournalEntry(jeNo)
      if (result.ok) {
        setToast({ text: `${jeNo} submitted.`, link: result.deep_link })
        refresh()
      } else {
        setToast({ text: `⚠ ${result.error?.message ?? 'Approve failed'}` })
      }
    } catch (err) {
      setToast({ text: `⚠ ${err instanceof Error ? err.message : 'Approve failed'}` })
    } finally {
      setApprovingJe(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK2, fontSize: 14 }}>
        Loading finance dashboard…
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RED, fontSize: 14 }}>
        Failed to load dashboard. <button onClick={() => refresh()} style={{ marginLeft: 8, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
      </div>
    )
  }

  const revStat: PeriodStat = data.revenue[revPeriod]
  const gstStat: PeriodStat = data.gstLiability[gstPeriod]
  const gmStat: GrossMarginStat = data.grossMargin[gmPeriod]

  const bucketsFor = (label: string | null) => {
    if (!label) return { buckets: data.receivablesAgeing.buckets, unavailable: false }
    const match = ENTITY_MATCH[label]
    if (!match) return { buckets: [], unavailable: true }
    return { buckets: data.receivablesAgeing.byEntity[match] ?? [], unavailable: false }
  }
  const debtorsResult = filterByLabel(data.receivablesAgeing.topDebtors, rcvEntity)
  const payInvoicesResult = filterByLabel(data.payablesInvoices14d, payEntity)
  const poApprovalResult = filterByLabel(data.poApprovalQueue, poEntity)
  const paymentsResult = filterByLabel(data.actionQueue.paymentsToRelease, aqEntity)
  const journalsResult = filterByLabel(data.actionQueue.journalEntriesPending, aqEntity)
  const aqResult = aqTab === 0 ? paymentsResult : journalsResult

  const bucketData = bucketsFor(rcvEntity)
  const payGrouped = groupInvoicesByDate(payInvoicesResult.rows)

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "Arial,'Arial Narrow',Helvetica,sans-serif", padding: 12 }}>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          background: NAVY, color: '#fff', fontSize: 12, padding: '10px 18px', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 480,
        }}>
          <span>{toast.text}</span>
          {toast.link && (
            <a href={toast.link} target="_blank" rel="noreferrer" style={{ color: '#9AA0D8', fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'underline' }}>
              Open ↗
            </a>
          )}
        </div>
      )}
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 11 }}>

        {/* Top bar */}
        <div style={{
          background: NAVY, borderBottom: `2px solid ${ORANGE}`, borderRadius: 12,
          padding: '13px 18px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          boxShadow: '0 6px 20px rgba(27,31,71,.22)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 19, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
              <i className="ti ti-report-money" style={{ color: '#9AA0D8' }} />
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.fullName ?? '…'}
            </div>
            <div style={{ fontSize: 13, color: '#B9BEE0' }}>
              Finance Head (CFO)&nbsp;|&nbsp;{today}&nbsp;|&nbsp;Synced {syncTime}&nbsp;|&nbsp;{data.entities.length} of {ENTITY_LABELS.length} entities reachable
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <FiscalYearSelect value={fyStartYear} onChange={setFyStartYear} />
            {/* Dashboard switcher */}
            <div style={{ position: 'relative' }} ref={switcherRef}>
              <button onClick={() => setShowSwitcher(v => !v)} style={{
                fontSize: 11, color: '#fff', background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.18)', borderRadius: 8,
                padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <i className="ti ti-layout-grid" style={{ fontSize: 13 }} /> Switch dashboard
              </button>
              {showSwitcher && (
                <div style={{
                  position: 'absolute', top: 34, right: 0, background: '#fff',
                  border: `1px solid ${BORDER}`, borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(42,47,105,.15)', zIndex: 50, minWidth: 190, padding: 6,
                }}>
                  {switcherOptions.map(o => (
                    <button key={o.slug} onClick={() => router.push(`/dashboard/${o.slug}`)} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      fontSize: 11.5, padding: '8px 11px', borderRadius: 7,
                      border: 'none', background: 'none', color: INK, cursor: 'pointer',
                    }}
                      onMouseOver={e => (e.currentTarget.style.background = NAVY_TINT)}
                      onMouseOut={e  => (e.currentTarget.style.background = 'none')}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Logout */}
            <button onClick={() => {
              document.cookie = 'ace_token=; path=/; max-age=0'
              document.cookie = 'ace_refresh=; path=/; max-age=0'
              document.cookie = 'ace_user=; path=/; max-age=0'
              router.push('/login')
            }} title="Logout" style={{
              fontSize: 11, color: 'rgba(255,255,255,.7)', background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.18)', borderRadius: 8,
              padding: '5px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,80,80,.25)')}
              onMouseOut={e  => (e.currentTarget.style.background = 'rgba(255,255,255,.08)')}>
              <i className="ti ti-logout" style={{ fontSize: 14 }} /> <span>Logout</span>
            </button>

            {/* Settings */}
            <div style={{ position: 'relative' }} ref={settingsRef}>
              <button onClick={() => setShowSettings(v => !v)} title="Finance settings" style={{
                fontSize: 11, color: '#fff', background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.18)', borderRadius: 8,
                padding: '5px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <i className="ti ti-settings" style={{ fontSize: 14 }} />
              </button>
              {showSettings && (
                <SettingsPanel onClose={() => setShowSettings(false)} onSaved={() => refresh()} />
              )}
            </div>

            {/* Bell / alerts */}
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button onClick={() => setShowNotif(v => !v)} style={{
                position: 'relative', fontSize: 11, color: '#fff',
                background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)',
                borderRadius: 8, padding: '5px 9px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>
                </svg>
                {data.alerts.length > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6, background: '#EF4444', color: '#fff',
                    fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 99,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  }}>{data.alerts.length}</span>
                )}
              </button>
              {showNotif && (
                <div style={{
                  position: 'absolute', right: 0, top: 34, width: 320, background: '#fff',
                  border: `1px solid ${BORDER}`, borderRadius: 10,
                  boxShadow: '0 12px 30px rgba(15,34,64,.18)', padding: 8, zIndex: 50,
                }}>
                  <h4 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: INK3, padding: '4px 6px 6px', margin: 0 }}>Needs attention</h4>
                  {data.alerts.length === 0
                    ? <div style={{ padding: '7px 6px', fontSize: 11, color: INK3 }}>No active alerts</div>
                    : data.alerts.map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 6px', borderRadius: 7, fontSize: 11, color: INK }}>
                        <i className={`ti ${a.level === 'red' ? 'ti-alert-octagon' : 'ti-alert-triangle'}`} style={{ fontSize: 15, color: a.level === 'red' ? RED : AMBER, flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <div style={{ lineHeight: 1.4, fontWeight: 700 }}>{a.title}</div>
                          <div style={{ lineHeight: 1.4, color: INK2 }}>{a.subtitle}</div>
                          {a.reason && <div style={{ fontSize: 9.5, color: INK3, marginTop: 2, fontStyle: 'italic' }}>{a.reason}</div>}
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {data.alerts.map((a, i) => {
            const Wrapper = a.link ? 'a' : 'div'
            return (
              <Wrapper key={i} {...(a.link ? { href: a.link, target: '_blank', rel: 'noreferrer' } : {})} style={{
                background: a.level === 'red' ? RED_BG : AMBER_BG,
                border: `1px solid ${a.level === 'red' ? '#E4B4B4' : '#F2DCAE'}`,
                borderRadius: 10, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 9,
                fontSize: 11, lineHeight: 1.45, color: a.level === 'red' ? RED : AMBER,
                textDecoration: 'none', cursor: a.link ? 'pointer' : 'default',
              }}>
                <i className={`ti ${a.level === 'red' ? 'ti-alert-octagon' : 'ti-alert-triangle'}`} style={{ fontSize: 16, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, display: 'block', marginBottom: 2 }}>{a.title}</span>
                  {a.subtitle && <span style={{ color: INK, opacity: .82 }}>{a.subtitle.split(', ').map(shortEntity).join(', ')}</span>}
                  {a.reason && <div style={{ fontSize: 10.5, color: INK, opacity: .82, marginTop: 2 }}><strong>Why:</strong> {a.reason}</div>}
                </div>
                {a.entityLabel && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
                    padding: '3px 9px', borderRadius: 99, border: '1px solid currentColor', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{shortEntity(a.entityLabel)}</span>
                )}
                {a.link && <i className="ti ti-external-link" style={{ fontSize: 14, opacity: .55, flexShrink: 0 }} />}
              </Wrapper>
            )
          })}
        </div>

        {/* KPI band */}
        <div style={{ background: '#1E2352', borderRadius: 14, padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#A9C2DC', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-report-money" style={{ color: ORANGE, fontSize: 15 }} />Group financial summary
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 11 }}>
            <KpiTile label="Cash & Bank (Group)" value={fmtMoney(data.cashBank.total)} sub={`${data.cashBank.changeVs7d >= 0 ? '+' : ''}${fmtMoney(data.cashBank.changeVs7d)} vs last week`} accent={data.cashBank.changeVs7d >= 0 ? GREEN : AMBER} spark={data.cashBank.spark} />
            <KpiTile label="Overdue Receivables" value={fmtMoney(data.overdueReceivables.total)} sub={`${fmtMoney(data.overdueReceivables.over90)} > 90 days (${data.overdueReceivables.over90Count})`} accent={RED} negative spark={data.overdueReceivables.spark}
              viewAllHref={data.erpBaseUrl ? `${data.erpBaseUrl}/app/query-report/Accounts Receivable` : undefined} />
            <KpiTile label="Payables Due This Week" value={fmtMoney(data.payablesDue7d.total)} sub={`${data.payablesDue7d.vendors} vendor${data.payablesDue7d.vendors === 1 ? '' : 's'}${data.payablesDue7d.lastDueDate ? ` — due by ${fmtDate(data.payablesDue7d.lastDueDate)}` : ''}`} accent={AMBER} spark={data.payablesDue7d.spark}
              viewAllHref={data.erpBaseUrl ? `${data.erpBaseUrl}/app/query-report/Accounts Payable` : undefined} />
            <KpiTile
              label={<>Revenue <span style={{ fontWeight: 400 }}>{revStat.periodLabel}</span></>}
              value={fmtMoney(revStat.total)} sub="vs target — awaiting ERP setup" accent={AMBER} spark={data.revenue.spark[revPeriod]}
              toggle={<PeriodTabs period={revPeriod} onChange={setRevPeriod} />}
            />
            <KpiTile
              label={<>GST Liability <span style={{ fontWeight: 400 }}>{gstStat.periodLabel}</span></>}
              value={fmtMoney(gstStat.total)} sub="Output tax" accent={RED} negative spark={data.gstLiability.spark[gstPeriod]}
              toggle={<PeriodTabs period={gstPeriod} onChange={setGstPeriod} />}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card title="Cash & Bank Position" icon="ti-building-bank">
              <div style={{ background: NAVY, borderRadius: 10, padding: '11px 13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#B9BEE0' }}>Group total</div>
                  <div style={{ fontSize: 9, color: '#9DA0C4', marginTop: 3 }}>Confirmed as of {syncTime} today</div>
                </div>
                <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 22, color: '#fff' }}>{fmtMoney(data.cashBank.total)}</div>
              </div>
              {data.cashBank.byEntity.map(e => {
                return (
                  <div key={e.entity} style={{ borderRadius: 9, background: BG, overflow: 'hidden', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 11px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{shortEntity(e.entity)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: e.changeVs7d >= 0 ? GREEN : RED }}>
                        {e.changeVs7d >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(e.changeVs7d))}
                      </span>
                      <span style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 13, color: INK }}>{fmtMoney(e.value)}</span>
                    </span>
                  </div>
                )
              })}
            </Card>

            <Card title={<>Gross Margin — by Entity <span style={{ fontWeight: 400 }}>{gmStat.periodLabel}</span></>} icon="ti-chart-bar" right={<PeriodTabsLight period={gmPeriod} onChange={setGmPeriod} />}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingBottom: 14, marginBottom: 4, borderBottom: `1px solid ${BORDER}` }}>
                <GaugeRing pct={gmStat.gmPct} target={gmStat.targetPct} subLabel="Blended GM" />
                {gmStat.gmPct === null && <div style={{ fontSize: 9.5, color: INK3, fontStyle: 'italic' }}>No income posted in this period</div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: INK2, marginBottom: 10 }}>
                <span>Direct Income: <strong style={{ color: INK }}>{fmtMoney(gmStat.income)}</strong></span>
                <span>Direct Expense: <strong style={{ color: INK }}>{fmtMoney(gmStat.expense)}</strong></span>
              </div>
              {gmStat.byEntity.map(e => {
                const color = e.gmPct === null ? INK3 : e.gmPct >= gmStat.targetPct ? GREEN : e.gmPct >= gmStat.targetPct - 5 ? AMBER : RED
                const barWidth = e.gmPct === null ? 0 : Math.min(100, e.gmPct * 2.5)
                return (
                  <div key={e.entity} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: INK, width: 96, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortEntity(e.entity)}</span>
                    <div style={{ flex: 1, height: 12, background: BG, borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${barWidth}%`, height: 12, borderRadius: 99, background: color }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, width: 34, textAlign: 'right', flexShrink: 0, fontFamily: 'monospace', color }}>{e.gmPct === null ? '—' : `${e.gmPct}%`}</span>
                  </div>
                )
              })}
              <div style={{ fontSize: 9, color: INK3, fontStyle: 'italic', marginTop: 4 }}>Only entities with a reachable database are shown — currently {data.entities.length} of {ENTITY_LABELS.length}.</div>
            </Card>
          </div>

          <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card title="Receivables Ageing" icon="ti-clock">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 9.5, color: INK2 }}>
                {(['0-30', '31-60', '61-90', '90+'] as const).map(b => (
                  <span key={b} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i style={{ width: 9, height: 9, borderRadius: 2, background: BUCKET_COLOR[b], display: 'inline-block' }} />{b} days
                  </span>
                ))}
              </div>
              {bucketData.unavailable
                ? <NoDataForEntity label={rcvEntity!} />
                : debtorsResult.rows.filter(d => d.buckets.length > 0).length === 0
                  ? <div style={{ fontSize: 10.5, color: INK2, textAlign: 'center', padding: '14px 4px' }}>No open receivables.</div>
                  : debtorsResult.rows.filter(d => d.buckets.length > 0).slice(0, 10).map(d => <DebtorBar key={d.customer + d.entity} debtor={d} />)
              }
              <EntityFilterBar active={rcvEntity} onSelect={setRcvEntity} />
              <ViewAllBottom href={cardErpLink(data.erpBaseUrl, '/app/query-report/Accounts Receivable', rcvEntity)} />
            </Card>
          </div>

          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card title="Approval Queue" icon="ti-checklist" right={
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: RED_BG, color: RED }}>
                {poApprovalResult.rows.length} pending
              </span>
            }>
              {poApprovalResult.unavailable
                ? <NoDataForEntity label={poEntity!} />
                : poApprovalResult.rows.length === 0
                  ? <div style={{ fontSize: 10.5, color: INK2, textAlign: 'center', padding: '14px 4px' }}>No POs pending approval.</div>
                  : poApprovalResult.rows.slice(0, 10).map(p => (
                    <div key={p.poNo} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: NAVY }}>{p.poNo} <span style={{ fontWeight: 400, color: INK2 }}>· {p.vendor}</span></div>
                        <div style={{ fontSize: 9, color: INK3 }}>{p.approvalStage}</div>
                      </div>
                      <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: INK, flexShrink: 0 }}>{fmtMoney(p.value)}</span>
                      <span style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: AMBER_BG, color: AMBER, flexShrink: 0, whiteSpace: 'nowrap' }}>{p.daysPending}d</span>
                      <button
                        disabled={approvingPo === p.poNo}
                        onClick={() => handleApprovePo(p.poNo)}
                        style={{
                          fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 99, flexShrink: 0,
                          border: `1px solid ${GREEN}`, color: GREEN, background: 'none', cursor: 'pointer',
                          opacity: approvingPo === p.poNo ? 0.5 : 1,
                        }}>
                        {approvingPo === p.poNo ? '...' : 'Approve'}
                      </button>
                    </div>
                  ))
              }
              <EntityFilterBar active={poEntity} onSelect={setPoEntity} />
              <ViewAllBottom href={cardErpLink(data.erpBaseUrl, '/app/purchase-order?status=Draft&workflow_state=Awaiting AM Approval', poEntity)} />
            </Card>

            <Card title="Revenue vs Target" icon="ti-target">
              <BlockedState reason={data.revenueVsTarget.reason} />
            </Card>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 420px' }}>
            <Card title="Payables Due — Next 14 Days" icon="ti-calendar">
              {payInvoicesResult.unavailable
                ? <NoDataForEntity label={payEntity!} />
                : payGrouped.length === 0
                  ? <div style={{ fontSize: 10.5, color: INK2, textAlign: 'center', padding: '14px 4px' }}>No payables due in the next 14 days.</div>
                  : payGrouped.map(([dueDate, rows]) => {
                      const daysAway = Math.round((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
                      const { bg, fg } = URGENCY_COLOR(daysAway)
                      const total = rows.reduce((s, r) => s + r.amount, 0)
                      return (
                        <div key={dueDate} style={{ padding: '8px 10px', borderRadius: 9, background: bg }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={{ fontSize: 9.5, fontWeight: 700, width: 90, flexShrink: 0, color: fg }}>{fmtDate(dueDate)}</span>
                            <span style={{ flex: 1, fontSize: 10.5, color: INK }}>{rows.map(r => r.supplier).join(', ')}</span>
                            <span style={{ fontWeight: 700, fontSize: 11, color: fg, fontFamily: 'monospace' }}>{fmtMoney(total)}</span>
                          </div>
                        </div>
                      )
                    })
              }
              <EntityFilterBar active={payEntity} onSelect={setPayEntity} />
              <ViewAllBottom href={cardErpLink(data.erpBaseUrl, '/app/query-report/Accounts Payable', payEntity)} />
            </Card>
          </div>

          <div style={{ flex: '1 1 420px' }}>
            <Card title="Action Queue" icon="ti-clock" right={
              <a href={aqErpLinkFor(data.erpBaseUrl, aqTab, aqEntity)} target="_blank" rel="noreferrer" style={{
                fontSize: 10, fontWeight: 700, color: NAVY, border: `1px solid ${BORDER}`, background: '#fff',
                padding: '4px 10px', borderRadius: 99, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <i className="ti ti-external-link" style={{ fontSize: 13 }} />View all
              </a>
            }>
              <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${BORDER}`, marginBottom: 4 }}>
                {(['Purchase Invoices to Release', 'Journal Entries'] as const).map((label, i) => {
                  const count = i === 0 ? data.actionQueue.paymentsToReleaseTotal : data.actionQueue.journalEntriesPending.length
                  return (
                    <button key={label} onClick={() => setAqTab(i as 0 | 1)} style={{
                      fontSize: 10, fontWeight: 700, padding: '5px 9px', border: 'none', background: 'none',
                      color: aqTab === i ? NAVY : INK2, borderBottom: `2px solid ${aqTab === i ? ORANGE : 'transparent'}`, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5, marginBottom: -1,
                    }}>
                      {label}
                      <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: count > 0 ? RED_BG : BG, color: count > 0 ? RED : INK3 }}>{count}</span>
                    </button>
                  )
                })}
              </div>
              {aqResult.unavailable
                ? <NoDataForEntity label={aqEntity!} />
                : aqResult.rows.length === 0
                  ? <div style={{ fontSize: 10.5, color: INK2, textAlign: 'center', padding: '14px 4px' }}>No items in this view.</div>
                  : <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                        {aqTab === 0 && <>
                          <AqThead cols={['Invoice', 'Vendor', 'Amount', 'Due Date', 'Overdue', 'Action']} />
                          <tbody>
                            {paymentsResult.rows.slice(0, 10).map(r => (
                              <tr key={r.invoiceNo}>
                                <AqTd style={{ color: NAVY, fontWeight: 700 }}>{r.invoiceNo}</AqTd>
                                <AqTd>{r.vendor}</AqTd>
                                <AqTd style={{ fontFamily: 'monospace' }}>{fmtMoney(r.amount)}</AqTd>
                                <AqTd>{fmtDate(r.dueDate)}</AqTd>
                                <AqTd><Pill bg={RED_BG} fg={RED}>{r.daysOverdue}d</Pill></AqTd>
                                <AqTd>
                                  <button
                                    disabled={releasingInvoice === r.invoiceNo}
                                    onClick={() => handleRelease(r.invoiceNo)}
                                    style={{
                                      fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                                      border: `1px solid ${GREEN}`, color: GREEN, background: 'none', cursor: 'pointer',
                                      opacity: releasingInvoice === r.invoiceNo ? 0.5 : 1,
                                    }}>
                                    {releasingInvoice === r.invoiceNo ? '...' : 'Release'}
                                  </button>
                                </AqTd>
                              </tr>
                            ))}
                          </tbody>
                        </>}
                        {aqTab === 1 && <>
                          <AqThead cols={['JE No.', 'Narration', 'Amount', 'Type', 'Days Pending', 'Action']} />
                          <tbody>
                            {journalsResult.rows.slice(0, 10).map(r => (
                              <tr key={r.name}>
                                <AqTd style={{ color: NAVY, fontWeight: 700 }}>{r.name}</AqTd>
                                <AqTd>{r.userRemark}</AqTd>
                                <AqTd style={{ fontFamily: 'monospace' }}>{fmtMoney(r.totalDebit)}</AqTd>
                                <AqTd><Pill bg={BG} fg={NAVY}>{r.voucherType}</Pill></AqTd>
                                <AqTd>{r.daysPending}d</AqTd>
                                <AqTd>
                                  <button
                                    disabled={approvingJe === r.name}
                                    onClick={() => handleApproveJe(r.name)}
                                    style={{
                                      fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                                      border: `1px solid ${GREEN}`, color: GREEN, background: 'none', cursor: 'pointer',
                                      opacity: approvingJe === r.name ? 0.5 : 1,
                                    }}>
                                    {approvingJe === r.name ? '...' : 'Approve'}
                                  </button>
                                </AqTd>
                              </tr>
                            ))}
                          </tbody>
                        </>}
                      </table>
                    </div>
              }
              <EntityFilterBar active={aqEntity} onSelect={setAqEntity} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiTile({ label, value, sub, accent, negative, spark, toggle, viewAllHref }: {
  label: React.ReactNode; value: string; sub: string; accent: string; negative?: boolean; spark: SparkPoint[]; toggle?: React.ReactNode; viewAllHref?: string
}) {
  return (
    <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderTop: `3px solid ${accent}`, borderRadius: 10, padding: '12px 13px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: '#A9C2DC', marginBottom: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span>{label}</span>{toggle}
      </div>
      <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 23, color: negative ? '#FFB4B4' : '#fff' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#A9C2DC', marginTop: 8 }}>{sub}</div>
      <Sparkline points={spark} />
      {viewAllHref && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <a href={viewAllHref} target="_blank" rel="noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 11, fontSize: 10, fontWeight: 700,
            color: '#A9C2DC', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)',
            borderRadius: 99, padding: '4px 10px', textDecoration: 'none',
          }}>
            <i className="ti ti-external-link" style={{ fontSize: 12 }} />View all
          </a>
        </div>
      )}
    </div>
  )
}
