'use client'

import { Children, cloneElement, isValidElement, useState, useRef, useEffect } from 'react'
import type { ReactElement, ReactNode, CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useStoresHomepage, submitGrn, createMaterialRequest, createPoFromMr } from '@/hooks/useStoresHomepage'
import { FiscalYearSelect } from '@/components/widgets/FiscalYearSelect'
import { currentFiscalYearStart } from '@/lib/fiscalYear'
import { colors } from '@/lib/brand'
import { formatMoney } from '@/lib/format'
import type { PickListRow, BelowReorderNoPoRow } from '@/types/stores'

// Ported verbatim from PROMAN/frontend/src/app/home/stores-head/page.tsx
// (client-approved design — do not restyle). Plumbing changes only: hook
// import paths (dashboardsApi/cookie auth), the dashboard-switcher is now a
// flat list with /dashboard/* routes, and the logout handler uses our real
// cookie names + /login.

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
const INFO      = '#1D4ED8' // matches template's --info (no equivalent in brand.ts yet)
const INFO_BG   = 'rgba(29,78,216,.10)' // matches template's --bg-info
const NEUTRAL_BG = 'rgba(107,114,128,.10)' // matches template's --bg-neutral — distinct from BG so
                                            // a neutral pill stays visible against a BG-colored row

const fmtMoney = formatMoney

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const SWITCHER_OPTIONS = [
  { label: 'Finance Head',       slug: 'finance'       },
  { label: 'Sales Head',         slug: 'sales'         },
  { label: 'Manufacturing Head', slug: 'manufacturing' },
  { label: 'Procurement Head',   slug: 'procurement'   },
  { label: 'Dispatch Head',      slug: 'dispatch'      },
]

// ── Shared primitives ─────────────────────────────────────────────────────────

function Card({ title, icon, right, children, fill }: { title: React.ReactNode; icon: string; right?: React.ReactNode; children: React.ReactNode; fill?: boolean }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '15px 16px', boxShadow: '0 1px 2px rgba(42,47,105,.05), 0 4px 12px rgba(42,47,105,.05)', display: 'flex', flexDirection: 'column', gap: 12, height: fill ? '100%' : undefined, boxSizing: 'border-box' }}>
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

function Pill({ children, tone }: { children: React.ReactNode; tone: 'd' | 'w' | 's' | 'n' | 'i' }) {
  const map = {
    d: { bg: RED_BG, fg: RED },
    w: { bg: AMBER_BG, fg: AMBER },
    s: { bg: colors.successBg, fg: GREEN },
    n: { bg: NEUTRAL_BG, fg: INK2 },
    i: { bg: INFO_BG, fg: INFO },
  }[tone]
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: map.bg, color: map.fg, whiteSpace: 'nowrap' }}>{children}</span>
}

function AqTab({ label, count, on, onClick }: { label: string; count?: number; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: 700, padding: '6px 11px', cursor: 'pointer',
      border: 'none', background: 'none', color: on ? NAVY : INK2,
      borderBottom: `2px solid ${on ? ORANGE : 'transparent'}`,
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {label}
      {count !== undefined && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: count > 0 ? RED_BG : BG, color: count > 0 ? RED : INK3 }}>{count}</span>
      )}
    </button>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, color: INK2, textAlign: 'center', padding: '14px 4px' }}>{children}</div>
}

// v3: Pick List Pending is a plain 2-state pill — Pending (nothing picked) or
// Partial (some picked). A fully-picked pick list moves out of Open/Draft
// status and drops out of this query entirely, so there's no 3rd "Ready" state.
// Status column: Pending/Partial stay as pills; a fully-picked pick list gets
// an "Issue" action button (deep-links to a new Stock Entry for that WO).
function pickListStatus(row: PickListRow, issueHref: string) {
  if (row.pickedQty <= 0) return <Pill tone="w">Pending</Pill>
  if (row.pickedQty < row.requiredQty) return <Pill tone="i">Partial</Pill>
  return <a href={issueHref} target="_blank" rel="noreferrer"><button style={btnOk}>Issue</button></a>
}

function pickListRowTone(row: PickListRow): 'd' | 'w' | 's' | 'i' {
  if (row.pickedQty <= 0) return 'w'
  if (row.pickedQty < row.requiredQty) return 'i'
  return 's'
}

// 3px colored left-edge stripe on a row's first cell, matching the template's
// .dl/.al/.gl/.il row treatment (danger/amber/green/info severity indicator).
function rowStripe(tone: 'd' | 'w' | 's' | 'i' | 'n'): React.CSSProperties {
  const color = tone === 'd' ? RED : tone === 'w' ? AMBER : tone === 'i' ? INFO : tone === 'n' ? colors.navyMid : GREEN
  return { boxShadow: `inset 3px 0 0 ${color}` }
}

// v3: Pending GRN queue is sorted by approval urgency — Pending for Approval
// first (needs the Stores Head's action now), then Sent For Approval, then Draft.
function grnApprovalTone(state: string): 'd' | 'w' | 'n' {
  if (state === 'Pending for Approval') return 'd'
  if (state === 'Sent For Approval') return 'w'
  return 'n'
}

// Full approval-state text is long enough to crowd the Action column — show a
// short label in the pill, full text still available via the title tooltip.
function grnApprovalShortLabel(state: string): string {
  if (state === 'Pending for Approval') return 'Pending'
  if (state === 'Sent For Approval') return 'Sent'
  return state
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StoresHeadPage() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [fyStartYear, setFyStartYear] = useState(currentFiscalYearStart())
  const { data, isLoading, isError, status, refresh } = useStoresHomepage(fyStartYear)

  const [showSwitcher, setShowSwitcher] = useState(false)
  const [showNotif, setShowNotif]       = useState(false)
  const [aqTab, setAqTab]               = useState<0 | 1>(0)
  const [busyAction, setBusyAction]     = useState<string | null>(null)
  const [toast, setToast]               = useState<{ ok: boolean; text: string; href?: string; hrefLabel?: string } | null>(null)
  const switcherRef = useRef<HTMLDivElement>(null)
  const notifRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setShowSwitcher(false)
      if (notifRef.current    && !notifRef.current.contains(e.target as Node))    setShowNotif(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Auto-dismiss the write-back toast after 8s, like a real toast notification.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(t)
  }, [toast])

  const today    = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const isoToday = new Date().toISOString().slice(0, 10) // ERPNext list-view date filters need a real date, not the literal "Today"
  const syncTime = data ? new Date(data.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK2, fontSize: 14 }}>
        Loading stores dashboard…
      </div>
    )
  }
  if (isError || !data) {
    const isForbidden = status === 403
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isForbidden ? INK2 : RED, fontSize: 14, textAlign: 'center', padding: '0 24px' }}>
        {isForbidden ? (
          <span>
            You don&apos;t have access to this dashboard. Your account role isn&apos;t permitted to view this page.{' '}
            <a href="/login" style={{ color: NAVY, textDecoration: 'underline' }}>Back to login</a>
          </span>
        ) : (
          <span>
            Failed to load dashboard. <button onClick={() => refresh()} style={{ marginLeft: 8, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
          </span>
        )}
      </div>
    )
  }

  const erpBase = data.erpBaseUrl.replace(/\/$/, '')
  const erpUrl  = (path: string) => `${erpBase}/app/${path}`

  // Write-back actions (proman_edge.api.stores.*) — proxy calls, show a toast,
  // refresh the homepage data on success so the acted-on row disappears.
  // The live API's `summary` field doesn't always match the doc's "preformatted
  // string" description — some endpoints return the created doc's key fields as
  // an object instead (e.g. {material_request, item_code, qty, docstatus}).
  // Never render that object directly; always coerce to a readable string.
  function formatActionText(value: unknown, fallback: string): string {
    if (value == null) return fallback
    if (typeof value === 'string') return value
    if (typeof value === 'object') {
      const o = value as Record<string, unknown>
      const id = o.material_request ?? o.purchase_order ?? o.grn ?? o.name
      if (id) {
        const extra = Object.entries(o)
          .filter(([k]) => !['material_request', 'purchase_order', 'grn', 'name', 'docstatus'].includes(k))
          .map(([k, v]) => `${k}: ${v}`).join(', ')
        return `${id}${extra ? ` (${extra})` : ''}`
      }
      return JSON.stringify(o)
    }
    return String(value)
  }

  // Defensive: some error paths hand back the whole `{success:false,error:"..."}`
  // envelope as a stringified blob instead of a clean message. Unwrap it so a
  // raw JSON string never ends up rendered in the toast.
  function extractErrorMessage(err: unknown): string {
    let msg = err instanceof Error ? err.message : String(err)
    const trimmed = msg.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (typeof parsed?.error === 'string') msg = parsed.error
        else if (typeof parsed?.message === 'string') msg = parsed.message
      } catch { /* not JSON — leave msg as-is */ }
    }
    return msg
  }

  async function runAction(key: string, fn: () => Promise<{ ok: boolean; summary?: unknown; error?: { message: string } }>) {
    setBusyAction(key)
    setToast(null)
    try {
      const result = await fn()
      if (result.ok) {
        setToast({ ok: true, text: formatActionText(result.summary, 'Done.') })
        refresh()
      } else {
        setToast({ ok: false, text: formatActionText(result.error?.message, 'Action failed.') })
      }
    } catch (err) {
      setToast({ ok: false, text: extractErrorMessage(err) })
    } finally {
      setBusyAction(null)
    }
  }

  function handleSubmitGrn(grnNo: string) {
    runAction(`grn:${grnNo}`, () => submitGrn(grnNo))
  }

  function handleCreateMr(row: BelowReorderNoPoRow) {
    const qty = Math.max(1, row.reorderLevel - row.currentStock)
    runAction(`mr:${row.itemCode}`, () => createMaterialRequest(row.itemCode, qty, row.warehouse))
  }

  async function handleCreatePoFromMr(row: BelowReorderNoPoRow) {
    if (!row.openMr) return
    const mr = row.openMr
    const key = `po:${row.itemCode}`
    setBusyAction(key)
    setToast(null)
    try {
      const result = await createPoFromMr(mr)
      if (result.ok) {
        setToast({ ok: true, text: formatActionText(result.summary, 'Done.') })
        refresh()
      } else if (result.error?.code === 'NOT_SUBMITTED') {
        setToast({
          ok: false,
          text: `${mr} hasn't been submitted yet — a PO can only be created from a submitted Material Request.`,
          href: erpUrl(`material-request/${encodeURIComponent(mr)}`), hrefLabel: 'Open MR to submit',
        })
      } else {
        setToast({ ok: false, text: formatActionText(result.error?.message, 'Action failed.') })
      }
    } catch (err) {
      const msg = extractErrorMessage(err)
      if (msg.includes('NOT_SUBMITTED')) {
        setToast({
          ok: false,
          text: `${mr} hasn't been submitted yet — a PO can only be created from a submitted Material Request.`,
          href: erpUrl(`material-request/${encodeURIComponent(mr)}`), hrefLabel: 'Open MR to submit',
        })
      } else {
        setToast({ ok: false, text: msg })
      }
    } finally {
      setBusyAction(null)
    }
  }

  // ── Alert Triggers (A-STR, per Shivam's v4 doc) — 4 buildable of 5
  // (A-STR-A3 is blocked: no Pick List workflow state on this ERPNext instance).
  const alerts: { level: 'red' | 'amber'; message: string }[] = []

  // A-STR-R1 (red): draft GRN dated today, not submitted by 16:00. Same source
  // as the W-STR-01 KPI (grnsPendingToday) — just corrected wording, since the
  // old text ("deliveries due today") described the pre-v3 PO-based logic.
  if (data.grnsPendingToday.count > 0) {
    alerts.push({
      level: 'red',
      message: `${data.grnsPendingToday.count} GRN${data.grnsPendingToday.count === 1 ? '' : 's'} dated today not yet submitted.`,
    })
  }

  // A-STR-R2 (red): stock-out on a WO due within 3 days. Section 1 is already
  // sorted by due date ascending, so the first row is the most urgent one —
  // only escalate to the banner if it's genuinely within the 3-day window.
  const firstStockOut = data.stockAlerts.stockOutBlockingProduction[0]
  const stockOutDaysUntilDue = firstStockOut?.plannedEnd
    ? Math.round((new Date(firstStockOut.plannedEnd).getTime() - Date.now()) / 86_400_000)
    : null
  if (firstStockOut && stockOutDaysUntilDue !== null && stockOutDaysUntilDue <= 3) {
    alerts.push({
      level: 'red',
      message: `Stock-out: ${firstStockOut.itemName} — 0 units.${firstStockOut.workOrder ? ` ${firstStockOut.workOrder}` : ''} due ${fmtDate(firstStockOut.plannedEnd)}. Raise PO immediately.`,
    })
  }

  // A-STR-R3 (red): Pick Lists pending/partial beyond the 2-day threshold.
  if (data.pickListsOverdue.count > 0) {
    alerts.push({
      level: 'red',
      message: `${data.pickListsOverdue.count} pick list${data.pickListsOverdue.count === 1 ? '' : 's'} pending action beyond 2 days.`,
    })
  }

  // A-STR-A1 (amber): below reorder, no open PO — reuses W-STR-08 §2 data.
  if (data.stockAlerts.belowReorderNoOpenPo.length > 0) {
    alerts.push({
      level: 'amber',
      message: `${data.stockAlerts.belowReorderNoOpenPo.length} item${data.stockAlerts.belowReorderNoOpenPo.length === 1 ? '' : 's'} below reorder with no PO raised.`,
    })
  }

  const banner = alerts.length
    ? { level: alerts.some(a => a.level === 'red') ? 'red' as const : 'amber' as const, text: alerts.map(a => a.message).join(' | ') }
    : null

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "Arial,'Arial Narrow',Helvetica,sans-serif", padding: 12 }}>
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
              <i className="ti ti-building-warehouse" style={{ color: '#9AA0D8' }} />
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.fullName ?? '…'}
            </div>
            <div style={{ fontSize: 13, color: '#B9BEE0' }}>
              Stores Head&nbsp;|&nbsp;PISPL&nbsp;|&nbsp;{today}&nbsp;|&nbsp;Synced {syncTime}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <FiscalYearSelect value={fyStartYear} onChange={setFyStartYear} />
            {data.grnsPendingToday.count > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'rgba(239,68,68,.18)', color: '#FF9B9B', display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 12 }} />{data.grnsPendingToday.count} GRN{data.grnsPendingToday.count === 1 ? '' : 's'} pending today
              </span>
            )}
            {data.stockBelowReorder.belowReorder > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'rgba(245,158,11,.18)', color: '#FFC773' }}>
                {data.stockBelowReorder.belowReorder} below reorder
              </span>
            )}
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
                  {SWITCHER_OPTIONS.map(o => (
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
                {alerts.length > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6, background: '#EF4444', color: '#fff',
                    fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 99,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  }}>{alerts.length}</span>
                )}
              </button>
              {showNotif && (
                <div style={{
                  position: 'absolute', right: 0, top: 34, width: 320, background: '#fff',
                  border: `1px solid ${BORDER}`, borderRadius: 10,
                  boxShadow: '0 12px 30px rgba(15,34,64,.18)', padding: 8, zIndex: 50,
                }}>
                  <h4 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: INK3, padding: '4px 6px 6px', margin: 0 }}>Needs attention</h4>
                  {alerts.length === 0
                    ? <div style={{ padding: '7px 6px', fontSize: 11, color: INK3 }}>No active alerts</div>
                    : alerts.map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 6px', borderRadius: 7, fontSize: 11, color: INK }}>
                        <i className={`ti ${a.level === 'red' ? 'ti-alert-octagon' : 'ti-alert-triangle'}`} style={{ fontSize: 15, color: a.level === 'red' ? RED : AMBER, flexShrink: 0, marginTop: 1 }} />
                        <div>{a.message}</div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alert banner — single combined line, matching the template */}
        {banner && (
          <div style={{
            background: banner.level === 'red' ? RED_BG : AMBER_BG,
            border: `1px solid ${banner.level === 'red' ? '#E4B4B4' : '#F2DCAE'}`,
            borderRadius: 10, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 9,
            fontSize: 12, color: banner.level === 'red' ? RED : AMBER,
          }}>
            <i className={`ti ${banner.level === 'red' ? 'ti-alert-octagon' : 'ti-alert-triangle'}`} style={{ fontSize: 17, flexShrink: 0 }} />
            <span>{banner.text}</span>
          </div>
        )}

        {/* Write-back result — a floating toast (fixed, bottom-right, auto-dismiss),
            deliberately distinct from the inline alert banner above. */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 200, maxWidth: 420,
            background: '#fff', border: `1px solid ${toast.ok ? '#9BC9A8' : '#E4B4B4'}`,
            borderLeft: `4px solid ${toast.ok ? GREEN : RED}`,
            borderRadius: 10, padding: '11px 14px', display: 'flex', alignItems: 'flex-start', gap: 9,
            fontSize: 12, color: INK, boxShadow: '0 8px 24px rgba(15,34,64,.18)',
          }}>
            <i className={`ti ${toast.ok ? 'ti-circle-check' : 'ti-alert-octagon'}`} style={{ fontSize: 17, flexShrink: 0, marginTop: 1, color: toast.ok ? GREEN : RED }} />
            <span style={{ flex: 1, lineHeight: 1.5 }}>
              {toast.text}{' '}
              {toast.href && (
                <a href={toast.href} target="_blank" rel="noreferrer" style={{ color: NAVY, fontWeight: 700, textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                  {toast.hrefLabel ?? 'Open →'}
                </a>
              )}
            </span>
            <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: INK3, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* KPI band — 4 independent floating cards, matching the template
            (no wrapping band/header — that was borrowed from Finance, not
            part of this spec). v3: cards are informational-only — the small
            "View all ↗" button is the only click target now, not the whole tile. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <KpiTile label="GRNs Pending Today" value={String(data.grnsPendingToday.count)} sub="Deliveries not GRN'd" accent={data.grnsPendingToday.count > 0 ? RED : GREEN}
            href={erpUrl(`purchase-receipt?docstatus=0&posting_date=${isoToday}`)} />
          <KpiTile label="Picklist Pending" value={String(data.materialIssuesPending.count)} sub="Pending / partial" accent={AMBER}
            href={erpUrl('pick-list?purpose=Material Transfer for Manufacture&status=["in",["Open","Draft"]]')} />
          {/* Per Shivam's v3 doc: /app/stock-balance (ERPNext's built-in Stock
              Levels page). Confirmed it loads, though its default sort isn't
              filtered to below-reorder items specifically — using as given. */}
          <KpiTile label="Stock Below Reorder" value={String(data.stockBelowReorder.belowReorder)} sub={`${data.stockBelowReorder.stockOut} are stock-out`} accent={RED}
            href={erpUrl('stock-balance')} />
          {/* View-all filter matches Shivam's v3 doc verbatim (status NOT IN
              Completed/Closed/Cancelled). Sub-label = K-04 secondary figure
              (submitted "Send to Subcontractor" stock entries on open SCOs). */}
          <KpiTile label="Subcontracting Order Pending" value={String(data.subcontractingOrders.count)} sub={`${data.subcontractingOrders.materialTransferred} material transfers`} accent={AMBER}
            href={erpUrl('subcontracting-order?status=["not in",["Completed","Closed","Cancelled"]]')} />
        </div>

        {/* Zone 3 — Pending GRN | Material issue | Stock alerts */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 340px' }}>
            <Card title="Pending GRN queue" icon="ti-truck-delivery" fill
              right={<Pill tone="d">{data.pendingGrnList.length} pending</Pill>}>
              {data.pendingGrnList.length === 0
                ? <EmptyState>No pending GRNs.</EmptyState>
                : <>
                    <Table
                      widths={['18%', '19%', '20%', '20%', '23%']}
                      head={['GRN ID', 'Vendor', 'Item', 'Status', 'Action']}
                      rows={data.pendingGrnList.slice(0, 8).map(r => (
                        <>
                          <td style={{ color: NAVY, fontWeight: 700, ...rowStripe(grnApprovalTone(r.approvalState)) }}>
                            <a href={erpUrl(`purchase-receipt/${encodeURIComponent(r.grnNo)}`)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}
                              title={`${r.grnNo} · ${fmtDate(r.postingDate)} · ${fmtMoney(r.value)}${r.linkedPo ? ` · PO ${r.linkedPo}` : ''}`}>{r.grnNo}</a>
                          </td>
                          <td title={r.vendor}>{r.vendor}</td>
                          <td title={r.firstItem}>{r.firstItem}{r.itemCount > 1 ? ' …' : ''}</td>
                          <td style={{ overflow: 'visible', paddingRight: 16 }}>
                            <Pill tone={grnApprovalTone(r.approvalState)}>
                              <span title={r.approvalState}>{grnApprovalShortLabel(r.approvalState)}</span>
                            </Pill>
                          </td>
                          <td style={{ overflow: 'visible', paddingLeft: 12, paddingRight: 14 }}>
                            <button
                              disabled={busyAction === `grn:${r.grnNo}`}
                              onClick={() => handleSubmitGrn(r.grnNo)}
                              style={{ ...btnPri, opacity: busyAction === `grn:${r.grnNo}` ? 0.5 : 1 }}
                            >{busyAction === `grn:${r.grnNo}` ? '…' : 'Submit'}</button>
                          </td>
                        </>
                      ))}
                    />
                    <ViewAllButton href={erpUrl('purchase-receipt?docstatus=0&workflow_state=Sent For Approval')} />
                  </>
              }
            </Card>
          </div>

          <div style={{ flex: '1 1 340px' }}>
            <Card title="Pick List Pending" icon="ti-list" right={<span style={{ fontSize: 10 }}><Pill tone="w">{data.materialIssueQueue.length} open</Pill></span>} fill>
              {data.materialIssueQueue.length === 0
                ? <EmptyState>No open pick lists.</EmptyState>
                : <>
                    <Table
                      widths={['24%', '17%', '17%', '19%', '23%']}
                      head={['Picklist ID', 'WO ID', 'Date', 'Total Qty', 'Status']}
                      rows={data.materialIssueQueue.slice(0, 8).map(r => (
                        <>
                          <td style={{ color: NAVY, fontWeight: 700, ...rowStripe(pickListRowTone(r)) }} title={r.pickListId}>{r.pickListId}</td>
                          <td>{r.workOrder ?? '—'}</td>
                          <td>{fmtDate(r.pickDate)}</td>
                          <td style={{ fontWeight: 700, paddingRight: 12 }}>{r.requiredQty} nos</td>
                          <td style={{ overflow: 'visible', paddingLeft: 10, paddingRight: 14 }}>
                            {pickListStatus(r, erpUrl(`stock-entry/new?purpose=Material Transfer for Manufacture${r.workOrder ? `&work_order=${encodeURIComponent(r.workOrder)}` : ''}`))}
                          </td>
                        </>
                      ))}
                    />
                    <ViewAllButton href={erpUrl('pick-list?purpose=Material Transfer for Manufacture&status=["in",["Open","Draft"]]')} />
                  </>
              }
            </Card>
          </div>

          <div style={{ flex: '1 1 320px' }}>
            <Card title="Stock alerts" icon="ti-package-off" right={<Pill tone="d">{data.stockAlerts.stockOutBlockingProduction.length} stock-out</Pill>} fill>
              {/* Section 1 keeps a plain "Raise PO" deep link — the v3 SQL doc's
                  stock-out query has no open_mr/next_action columns (only Section
                  2's below-reorder query does), so there's no MR-chain data here
                  to drive conditional MR/PO buttons. The v3 template mockup shows
                  MR/PO buttons on this section too, but that's demo copy without
                  a backing query — following the SQL doc over the mockup. */}
              <div style={{ background: RED_BG, borderLeft: `3px solid ${RED}`, borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: RED, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize: 13 }} />Stock-out — blocking production
                </div>
                {data.stockAlerts.stockOutBlockingProduction.length === 0
                  ? <EmptyState>No stock-outs blocking production.</EmptyState>
                  : data.stockAlerts.stockOutBlockingProduction.slice(0, 5).map(r => (
                    <div key={r.itemCode} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 100px auto', alignItems: 'center', gap: 8, fontSize: 10.5, padding: '5px 0' }}>
                      <span style={{ color: RED, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.itemName}>{r.itemName}</span>
                      <span style={{ color: INK2 }}>{r.workOrder ?? '—'}</span>
                      <a href={erpUrl('purchase-order/new')} target="_blank" rel="noreferrer" style={{ justifySelf: 'end' }}>
                        <button style={btnPri}>Raise PO</button>
                      </a>
                    </div>
                  ))
                }
              </div>
              <div style={{ background: AMBER_BG, borderLeft: `3px solid ${AMBER}`, borderRadius: 8, padding: '8px 12px', marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: AMBER, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <i className="ti ti-package-off" style={{ fontSize: 13 }} />Below reorder — no open PO
                </div>
                {data.stockAlerts.belowReorderNoOpenPo.length === 0
                  ? <EmptyState>No unordered below-reorder items.</EmptyState>
                  : data.stockAlerts.belowReorderNoOpenPo.slice(0, 5).map(r => (
                    <div key={r.itemCode + r.warehouse} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px auto', alignItems: 'center', gap: 8, fontSize: 10.5, padding: '5px 0' }}>
                      <span style={{ fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.itemName}>{r.itemName}</span>
                      <span style={{ color: INK2 }}>{r.currentStock}/{r.reorderLevel}</span>
                      <span style={{ justifySelf: 'end', display: 'flex', gap: 5 }}>
                        {r.openMr
                          ? <button
                              disabled={busyAction === `po:${r.itemCode}`}
                              onClick={() => handleCreatePoFromMr(r)}
                              title={`Create PO from ${r.openMr} · ${r.itemName}`}
                              style={{ ...btnPri, opacity: busyAction === `po:${r.itemCode}` ? 0.5 : 1 }}
                            >{busyAction === `po:${r.itemCode}` ? '…' : 'PO'}</button>
                          : <>
                              <button
                                disabled={busyAction === `mr:${r.itemCode}`}
                                onClick={() => handleCreateMr(r)}
                                style={{ ...btnOutline, opacity: busyAction === `mr:${r.itemCode}` ? 0.5 : 1 }}
                              >{busyAction === `mr:${r.itemCode}` ? '…' : 'MR'}</button>
                              <a href={erpUrl('purchase-order/new')} target="_blank" rel="noreferrer">
                                <button style={btnPri}>PO</button>
                              </a>
                            </>
                        }
                      </span>
                    </div>
                  ))
                }
              </div>
            </Card>
          </div>
        </div>

        {/* Zone 4 — Expected deliveries | Slow-moving stock */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <div style={{ flex: '1 1 420px' }}>
            <Card title="Expected deliveries — this week" icon="ti-calendar" fill>
              {data.expectedDeliveries.length === 0
                ? <EmptyState>No deliveries scheduled in the next 7 days.</EmptyState>
                : data.expectedDeliveries.map(d => {
                  const daysAway = Math.round((new Date(d.deliveryDate).getTime() - Date.now()) / 86_400_000)
                  // Matches the template exactly: today = navy row / info-blue pill,
                  // tomorrow = amber row+pill, rest = grey row / neutral pill.
                  const tone = daysAway <= 0
                    ? { bg: NAVY_TINT, fg: NAVY, pill: 'i' as const, border: NAVY }
                    : daysAway === 1
                      ? { bg: AMBER_BG, fg: AMBER, pill: 'w' as const, border: ORANGE }
                      : { bg: BG, fg: INK2, pill: 'n' as const, border: BORDER }
                  return (
                    <div key={d.deliveryDate} style={{ padding: '8px 10px', borderRadius: 9, background: tone.bg, borderLeft: `3px solid ${tone.border}`, display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, width: 96, flexShrink: 0, color: tone.fg }}>{fmtDate(d.deliveryDate)}</span>
                      <span style={{ flex: 1, fontSize: 10.5, color: INK }}>
                        {d.poCount} PO{d.poCount === 1 ? '' : 's'} · {d.subcontractingCount} subcontracting
                      </span>
                      <Pill tone={tone.pill}>{d.totalCount} total</Pill>
                    </div>
                  )
                })
              }
            </Card>
          </div>

          <div style={{ flex: '1 1 420px' }}>
            <Card title="Slow-moving stock" icon="ti-clock" right={<Pill tone="n">Top {data.slowMovingStock.length} by idle days</Pill>} fill>
              {data.slowMovingStock.length === 0
                ? <EmptyState>No idle stock detected.</EmptyState>
                : <>
                    <Table
                      widths={['28%', '18%', '11%', '14%', '12%', '17%']}
                      head={['Item', 'Category', 'Qty', 'Value', 'Idle', 'Action']}
                      rows={data.slowMovingStock.map(s => (
                        <>
                          <td style={{ fontWeight: 700 }} title={s.itemName}>{s.itemName}</td>
                          <td>{s.category}</td>
                          <td>{s.currentQty}</td>
                          <td>{fmtMoney(s.totalValue)}</td>
                          <td style={{ fontWeight: 700, color: s.daysIdle > 180 ? RED : AMBER }}>{s.daysIdle}d</td>
                          <td style={{ overflow: 'visible', paddingLeft: 10, paddingRight: 14 }}>
                            <a href={erpUrl(`query-report/Stock Ledger?item_code=${encodeURIComponent(s.itemCode)}`)} target="_blank" rel="noreferrer">
                              <button style={btnOutline}>Ledger</button>
                            </a>
                          </td>
                        </>
                      ))}
                    />
                    <ViewAllButton href={erpUrl('query-report/Stock Ageing')} />
                  </>
              }
            </Card>
          </div>
        </div>

        {/* Zone 5 — Action queue (2 tabs, top 10 each + tab-aware "View all") */}
        <Card title="Action queue" icon="ti-list-check" right={
          <a href={
            aqTab === 0 ? erpUrl('stock-reconciliation?docstatus=0')
              : erpUrl(`purchase-receipt?posting_date=${isoToday}`)
          } target="_blank" rel="noreferrer" style={{ fontSize: 10.5, fontWeight: 700, color: NAVY, textDecoration: 'none' }}>View all →</a>
        }>
          <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, gap: 2, marginTop: -4 }}>
            <AqTab label="Count variances" count={data.actionQueue.countVariances.length} on={aqTab === 0} onClick={() => setAqTab(0)} />
            <AqTab label="GRNs raised today" on={aqTab === 1} onClick={() => setAqTab(1)} />
          </div>
          <div style={{ paddingTop: 12 }}>
            {aqTab === 0 && (
              data.actionQueue.countVariances.length === 0
                ? <EmptyState>No open count variances.</EmptyState>
                : <Table
                    widths={['14%', '13%', '22%', '13%', '13%', '12%', '13%']}
                    head={['Reco ID', 'Reco Date', 'Item', 'System', 'Physical', 'Qty Diff', 'Value']}
                    rows={data.actionQueue.countVariances.slice(0, 10).map(v => (
                      <>
                        <td style={{ color: NAVY, fontWeight: 700 }} title={v.reconciliation}>{v.reconciliation}</td>
                        <td>{fmtDate(v.postingDate)}</td>
                        <td style={{ fontWeight: 700 }} title={v.itemCode}>{v.itemCode}</td>
                        <td>{v.systemQty}</td>
                        <td>{v.physicalQty}</td>
                        <td style={{ fontWeight: 700, color: v.varianceQty < 0 ? RED : GREEN }}>{v.varianceQty > 0 ? '+' : ''}{v.varianceQty}</td>
                        <td>{fmtMoney(v.varianceValue)}</td>
                      </>
                    ))}
                  />
            )}
            {aqTab === 1 && (
              data.actionQueue.grnsRaisedToday.length === 0
                ? <EmptyState>No GRNs raised yet today.</EmptyState>
                : <Table
                    widths={['18%', '24%', '28%', '16%', '14%']}
                    head={['GRN no.', 'Vendor', 'Items', 'Value', 'Created by']}
                    rows={data.actionQueue.grnsRaisedToday.slice(0, 10).map(g => (
                      <>
                        <td style={{ color: NAVY, fontWeight: 700 }}>{g.grnNo}</td>
                        <td title={g.vendor}>{g.vendor}</td>
                        <td title={g.firstItem}>{g.firstItem}{g.itemCount > 1 ? ' …' : ''}</td>
                        <td>{fmtMoney(g.value)}</td>
                        <td style={{ color: INK3 }} title={g.createdBy}>{g.createdBy}</td>
                      </>
                    ))}
                  />
            )}
          </div>
        </Card>

        {/* Zone 6 — Warehouse stock value | Quick actions */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1.4 1 420px' }}>
            <Card title="Warehouse stock value" icon="ti-building-warehouse"
              right={<a href={erpUrl('query-report/Stock Balance')} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, fontWeight: 700, color: NAVY, textDecoration: 'none' }}>View all →</a>}>
              {data.warehouseStockValue.slice(0, 10).map(w => (
                <div key={w.warehouse} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ fontSize: 12, color: NAVY }}>{w.warehouse} <span style={{ color: INK3 }}>· {w.items}</span></span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{fmtMoney(w.stockValue)}</span>
                </div>
              ))}
              <div style={{ background: NAVY_TINT, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: NAVY, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <i className="ti ti-building-warehouse" style={{ color: ORANGE }} />
                Total stock value <strong>{fmtMoney(data.warehouseStockValue.reduce((s, w) => s + w.stockValue, 0))}</strong> across {data.warehouseStockValue.length} warehouses
              </div>
            </Card>
          </div>

          <div style={{ flex: '1 1 320px' }}>
            <Card title="Quick actions" icon="ti-bolt">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <QuickAction icon="ti-package" label="Create GRN" href={erpUrl('purchase-receipt/new')} />
                <QuickAction icon="ti-list" label="Create Pick List" href={erpUrl('pick-list/new')} />
                <QuickAction icon="ti-transfer" label="Stock Transfer" href={erpUrl('stock-entry/new')} />
                <QuickAction icon="ti-building-factory-2" label="Subcontracting Order" href={erpUrl('subcontracting-order/new')} />
                <QuickAction icon="ti-package-off" label="Shortage Report" href={erpUrl('query-report/Work Order Stock Report')} />
                <QuickAction icon="ti-calendar" label="Expected Receipts" href={erpUrl('purchase-order?status=["in",["To Receive","To Receive and Bill"]]')} />
                <QuickAction icon="ti-report" label="Stock Ledger" href={erpUrl('query-report/Stock Ledger')} />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

const btnPri: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
  border: `1px solid ${ORANGE}`, background: '#fff', color: '#E06804',
}

const btnOutline: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
  border: `1px solid ${colors.navyMid}`, background: '#fff', color: NAVY,
}

const btnOk: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
  border: `1px solid ${GREEN}`, background: '#fff', color: GREEN,
}

function Table({ head, rows, widths }: { head: string[]; rows: React.ReactNode[]; widths?: string[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: widths ? 'fixed' : 'auto' }}>
      {widths && (
        <colgroup>
          {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
      )}
      <thead>
        <tr>
          {head.map(h => (
            <th key={h} style={{ background: NAVY, color: '#fff', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left', padding: '6px 7px' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const cells = Children.toArray((r as ReactElement<{ children?: ReactNode }>).props.children)
          return (
            <tr key={i} style={{ background: i % 2 === 1 ? BG : '#fff' }}>
              {cells.map((cell, j) => {
                if (!isValidElement(cell)) return cell
                const cellProps = cell.props as { style?: CSSProperties }
                return cloneElement(cell as ReactElement<{ style?: CSSProperties }>, {
                  key: j,
                  style: {
                    padding: '6px 7px', borderBottom: `1px solid ${BORDER}`,
                    color: INK, verticalAlign: 'middle',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    ...(cellProps.style ?? {}),
                  },
                })
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// Full-width "View all ↗" link at the bottom of a card, matching the
// template's `.vall` treatment.
function ViewAllButton({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'right', marginTop: 8, textDecoration: 'none' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#E06804' }}>View all ↗</span>
    </a>
  )
}

function QuickAction({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
      <button style={{
        width: '100%', fontSize: 11, fontWeight: 700, padding: '9px 10px', borderRadius: 8,
        border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 7, textAlign: 'left',
      }}>
        <i className={`ti ${icon}`} style={{ color: ORANGE, fontSize: 15 }} />{label}
      </button>
    </a>
  )
}

// Lightened variants of the semantic colors for legibility on the navy KPI
// band — plain RED/AMBER/GREEN read too dark against #1E2352 (matches the
// template's on-navy accent treatment: --t-d/.kv, --t-w/.kv, --t-s/.kv).
const KPI_VALUE_COLOR: Record<string, string> = {
  [RED]: '#FF7A6B',
  [AMBER]: ORANGE,
  [GREEN]: '#4ADE80',
}

// v3: KPI tiles are informational-only (no whole-card click) — only the small
// "View all ↗" button pinned to the bottom is actionable, matching the template.
function KpiTile({ label, value, sub, accent, href }: {
  label: string; value: string; sub: string; accent: string; href: string
}) {
  return (
    <div style={{
      background: 'linear-gradient(180deg,#32376F 0%,#2A2F69 100%)',
      border: '1px solid rgba(255,255,255,.09)', borderTop: `3px solid ${accent}`,
      borderRadius: 12, padding: '12px 16px',
      boxShadow: '0 1px 3px rgba(36,40,89,.25)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: '#C9CBE0', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 26, color: KPI_VALUE_COLOR[accent] ?? '#fff', margin: '6px 0 3px' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#8F92B5' }}>{sub}</div>
      <a href={href} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-end', marginTop: 'auto', textDecoration: 'none' }}>
        <button style={{
          fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 99, marginTop: 10,
          background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.22)', color: '#fff', cursor: 'pointer',
        }}>View all ↗</button>
      </a>
    </div>
  )
}
