'use client'

import { Children, cloneElement, isValidElement, useState, useRef, useEffect } from 'react'
import type { ReactElement, ReactNode, CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useDispatchHomepage, getDocumentationChecklist, useEwayBillStatus } from '@/hooks/useDispatchHomepage'
import { FiscalYearSelect } from '@/components/widgets/FiscalYearSelect'
import { currentFiscalYearStart } from '@/lib/fiscalYear'
import { colors } from '@/lib/brand'
import { formatMoney } from '@/lib/format'
import type { DocumentationChecklist, DispatchPipelineRow } from '@/types/dispatch'

// Ported verbatim from PROMAN/frontend/src/app/home/dispatch-head/page.tsx
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
const INFO      = '#1D4ED8'
const INFO_BG   = 'rgba(29,78,216,.10)'
const NEUTRAL_BG = 'rgba(107,114,128,.10)'

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
  { label: 'Stores Head',        slug: 'stores'        },
]

// ── Shared primitives (mirrors other homepages — no shared component exists yet) ─

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

// Blocker → pill tone + row stripe, matching the template's severity coding.
function blockerTone(blocker: DispatchPipelineRow['blocker']): 'd' | 'w' | 's' | 'n' {
  if (blocker === 'Ready') return 's'
  if (blocker === 'Vehicle pending') return 'w'
  if (blocker === 'Customer PO pending') return 'd'
  return 'n' // QC pending
}

function rowStripe(tone: 'd' | 'w' | 's' | 'i' | 'n'): React.CSSProperties {
  const color = tone === 'd' ? RED : tone === 'w' ? AMBER : tone === 'i' ? INFO : tone === 'n' ? colors.navyMid : GREEN
  return { boxShadow: `inset 3px 0 0 ${color}` }
}

function ewayStatusTone(status: string): 'd' | 'w' | 's' | 'i' {
  if (status === 'Expired') return 'd'
  if (status === 'Extend (today)') return 'd'
  if (status === 'Expiring soon') return 'w'
  return 's'
}

function vehicleBookingTone(row: { vehicleNo: string | null }): 'd' | 'w' {
  return row.vehicleNo ? 'w' : 'd'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DispatchHeadPage() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [fyStartYear, setFyStartYear] = useState(currentFiscalYearStart())
  const { data, isLoading, isError, refresh } = useDispatchHomepage(fyStartYear)
  const { data: ewayBills } = useEwayBillStatus()

  const [showSwitcher, setShowSwitcher] = useState(false)
  const [showNotif, setShowNotif]       = useState(false)
  const [aqTab, setAqTab]               = useState<0 | 1>(0)
  const [selectedDn, setSelectedDn]     = useState<string | null>(null)
  const [checklist, setChecklist]       = useState<DocumentationChecklist | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)
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

  // Default to the first (most urgent) row in the pipeline table, like the template.
  useEffect(() => {
    if (!selectedDn && data && data.pipelineTable.length > 0) {
      setSelectedDn(data.pipelineTable[0].dnNo)
    }
  }, [data, selectedDn])

  useEffect(() => {
    if (!selectedDn) return
    setChecklistLoading(true)
    getDocumentationChecklist(selectedDn)
      .then(setChecklist)
      .catch(() => setChecklist(null))
      .finally(() => setChecklistLoading(false))
  }, [selectedDn])

  const today    = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const syncTime = data ? new Date(data.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK2, fontSize: 14 }}>
        Loading dispatch dashboard…
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

  const erpBase = data.erpBaseUrl.replace(/\/$/, '')
  const erpUrl  = (path: string) => `${erpBase}/app/${path}`

  // A-DISP-01..05 alerts drive the bell dropdown + banner (replaces ad-hoc KPI-derived alerts).
  const alerts: { level: 'red' | 'amber'; message: string }[] = []
  const firstCommitted = data.alerts.committedDispatchToday[0]
  if (firstCommitted) {
    alerts.push({ level: 'red', message: `Committed dispatch today: ${firstCommitted.salesOrder} (${firstCommitted.customerName}) — Work Order completed, no delivery note yet.` })
  }
  const firstDelayed = data.alerts.woDelayed[0]
  if (firstDelayed) {
    alerts.push({ level: 'red', message: `${data.alerts.woDelayed.length} work order${data.alerts.woDelayed.length === 1 ? '' : 's'} delayed beyond expected delivery date (worst: ${firstDelayed.workOrder}, ${firstDelayed.daysLate}d late).` })
  }
  if (data.alerts.noVehicleTargetSoon.length > 0) {
    alerts.push({ level: 'amber', message: `${data.alerts.noVehicleTargetSoon.length} delivery note${data.alerts.noVehicleTargetSoon.length === 1 ? '' : 's'} ready but no vehicle booked, target within 3 days.` })
  }
  if (data.revenuePendingInvoice.revenuePending > 2_500_000) {
    alerts.push({ level: 'red', message: `Revenue pending invoicing (To-Bill DNs) is ${fmtMoney(data.revenuePendingInvoice.revenuePending)} — over ₹25L.` })
  } else if (data.revenuePendingInvoice.revenuePending > 1_000_000) {
    alerts.push({ level: 'amber', message: `Revenue pending invoicing (To-Bill DNs) is ${fmtMoney(data.revenuePendingInvoice.revenuePending)} — over ₹10L.` })
  }
  if (data.alerts.noDispatch3Days === 0) {
    alerts.push({ level: 'amber', message: 'No delivery note dispatched in the last 3 days.' })
  }

  const bannerSource = alerts.find(a => a.level === 'red') ?? alerts[0] ?? null
  const banner = bannerSource ? { level: bannerSource.level, text: alerts.slice(0, 2).map(a => a.message).join('  |  ') } : null

  const STAGES: { key: keyof typeof data.stageFlow; label: string; cls: 'n' | 'i' | 's' }[] = [
    { key: 'qcPending', label: 'QC pending', cls: 'n' },
    { key: 'qcCleared', label: 'QC cleared', cls: 'i' },
    { key: 'docsPending', label: 'Docs pending', cls: 'n' },
    { key: 'docsComplete', label: 'Docs complete', cls: 'i' },
    { key: 'vehicleBooked', label: 'Vehicle booked', cls: 'i' },
    { key: 'dispatched', label: 'Dispatched', cls: 's' },
  ]

  const weekMonday = (() => {
    const n = new Date(); const wd = n.getDay(); const diff = wd === 0 ? -6 : 1 - wd
    const mon = new Date(n); mon.setDate(n.getDate() + diff); return mon
  })()
  const weekSat = new Date(weekMonday); weekSat.setDate(weekMonday.getDate() + 5)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayDate = new Date()
  const in7Days = new Date(todayDate); in7Days.setDate(todayDate.getDate() + 7)

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
              <i className="ti ti-truck" style={{ color: '#9AA0D8' }} />
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.fullName ?? '…'}
            </div>
            <div style={{ fontSize: 13, color: '#B9BEE0' }}>
              Dispatch &amp; Logistics Head&nbsp;|&nbsp;PISPL&nbsp;|&nbsp;{today}&nbsp;|&nbsp;Synced {syncTime}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <FiscalYearSelect value={fyStartYear} onChange={setFyStartYear} />
            {data.dispatchBlocked.count > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'rgba(239,68,68,.18)', color: '#FF9B9B', display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 12 }} />{data.dispatchBlocked.count} dispatch blocked
              </span>
            )}
            {data.ewayBillsExpiring.expiringWeek > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'rgba(245,158,11,.18)', color: '#FFC773' }}>
                {data.ewayBillsExpiring.expiringWeek} e-way bill{data.ewayBillsExpiring.expiringWeek === 1 ? '' : 's'} expiring
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

        {/* Alert banner */}
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

        {/* KPI band — 5 tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
          <KpiTile label="Ready to Dispatch" value={String(data.readyToDispatch.count)} sub="QC cleared + docs complete" accent={GREEN} />
          <KpiTile label="Dispatch Blocked" value={String(data.dispatchBlocked.count)} sub="Docs · vehicle · invoice" accent={RED} />
          <KpiTile label="Dispatched This Week" value={String(data.dispatchedThisWeek.count)} sub={`${fmtMoney(data.dispatchedThisWeek.dispatchValue)} invoice value`} accent={INFO}
            href={erpUrl(`delivery-note?docstatus=1&posting_date=["between",["${iso(weekMonday)}","${iso(weekSat)}"]]`)} />
          <KpiTile label="e-Way Bills Expiring" value={String(data.ewayBillsExpiring.expiringWeek)} sub={`${data.ewayBillsExpiring.expiringToday} expires today`} accent={RED}
            href={erpUrl(`e-waybill-log?is_cancelled=0&valid_upto=["between",["${iso(todayDate)}","${iso(in7Days)}"]]`)} />
          <KpiTile label="Revenue Pending Invoice" value={fmtMoney(data.revenuePendingInvoice.revenuePending)} sub={`${data.revenuePendingInvoice.count} DNs awaiting invoice`} accent={AMBER}
            href={erpUrl(`delivery-note?posting_date=${encodeURIComponent(JSON.stringify(['Timespan', 'this year']))}&is_return=0&docstatus=1&status=To Bill`)} />
        </div>

        {/* Zone 3 — Pipeline | Documentation checklist | Vehicle booking + e-way status */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ flex: '1.3 1 400px' }}>
            <Card title="Dispatch readiness pipeline" icon="ti-layout-kanban" fill>
              <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 4 }}>
                {STAGES.map(s => (
                  <div key={s.key} style={{
                    flex: 1, minWidth: 84, textAlign: 'center', padding: '7px 4px', borderRadius: 8,
                    background: s.cls === 's' ? colors.successBg : s.cls === 'i' ? NAVY_TINT : BG,
                    color: s.cls === 's' ? GREEN : s.cls === 'i' ? NAVY : INK2,
                    fontSize: 10, fontWeight: 700,
                    border: `1px solid ${s.cls === 's' ? 'rgba(26,107,58,.4)' : s.cls === 'i' ? colors.navyMid : BORDER}`,
                  }}>
                    <span style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 16, display: 'block', marginBottom: 3 }}>{data.stageFlow[s.key]}</span>
                    {s.label}
                  </div>
                ))}
              </div>
              {data.pipelineTable.length === 0
                ? <EmptyState>No draft delivery notes in the pipeline.</EmptyState>
                : <>
                    <Table
                      widths={['18%', '24%', '22%', '18%', '18%']}
                      head={['DN no.', 'Customer', 'Product', 'Target date', 'Blocker']}
                      rows={data.pipelineTable.slice(0, 10).map(r => (
                        <>
                          <td
                            style={{ color: NAVY, fontWeight: 700, cursor: 'pointer', ...rowStripe(blockerTone(r.blocker)) }}
                            onClick={() => setSelectedDn(r.dnNo)}
                          >
                            <a href={erpUrl(`delivery-note/${encodeURIComponent(r.dnNo)}`)} target="_blank" rel="noreferrer"
                              style={{ color: 'inherit', textDecoration: 'none' }} title="Open in ERPNext">
                              {r.dnNo}
                            </a>
                          </td>
                          <td title={r.customerName} style={{ cursor: 'pointer' }} onClick={() => setSelectedDn(r.dnNo)}>{r.customerName}</td>
                          <td title={r.product} style={{ cursor: 'pointer' }} onClick={() => setSelectedDn(r.dnNo)}>{r.product}</td>
                          <td style={{ cursor: 'pointer' }} onClick={() => setSelectedDn(r.dnNo)}>{fmtDate(r.targetDate)}</td>
                          <td style={{ overflow: 'visible', cursor: 'pointer' }} onClick={() => setSelectedDn(r.dnNo)}><Pill tone={blockerTone(r.blocker)}>{r.blocker}</Pill></td>
                        </>
                      ))}
                    />
                    {data.pipelineTable.length > 10 && <ViewAllButton href={erpUrl('delivery-note?docstatus=0')} />}
                  </>
              }
            </Card>
          </div>

          <div style={{ flex: '1 1 300px' }}>
            <Card title="Documentation checklist" icon="ti-checklist" fill>
              {selectedDn && (
                <div style={{ fontSize: 11, color: INK2 }}>
                  {checklist?.customerName ?? '…'} — {selectedDn}
                </div>
              )}
              {checklistLoading
                ? <EmptyState>Loading checklist…</EmptyState>
                : !checklist
                  ? <EmptyState>Select a DN from the pipeline to view its checklist.</EmptyState>
                  : (
                    <div>
                      <DocRow label="QC certificate" ok={checklist.qcCertificate === 'Done'} />
                      <DocRow label="Sales invoice approved" ok={checklist.salesInvoiceApproved === 'Done'}
                        actionLabel="Request" actionHref={erpUrl(`sales-invoice/new?delivery_note=${encodeURIComponent(selectedDn ?? '')}`)} />
                      <DocRow label="e-Way bill generated" ok={checklist.ewayBillGenerated === 'Done'}
                        actionLabel="Generate" actionHref={erpUrl(`delivery-note/${encodeURIComponent(selectedDn ?? '')}`)} />
                      <DocRow label="Vehicle booking confirmed" ok={checklist.vehicleBookingConfirmed === 'Done'}
                        actionLabel="Book" actionHref={erpUrl(`delivery-note/${encodeURIComponent(selectedDn ?? '')}`)} />
                      <DocRow label="Customer PO verified" ok={checklist.customerPoVerified === 'Done'} />
                      <div style={{ marginTop: 12 }}>
                        <a href={erpUrl(`delivery-note/${encodeURIComponent(selectedDn ?? '')}`)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          <button style={{
                            fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 99, cursor: 'pointer',
                            border: `1px solid ${ORANGE}`, background: ORANGE, color: '#fff',
                          }}>Submit delivery note</button>
                        </a>
                      </div>
                    </div>
                  )
              }
            </Card>
          </div>

          <div style={{ flex: '1 1 340px' }}>
            <Card title="Vehicle booking status" icon="ti-truck-loading" fill right={<Pill tone="d">{data.vehicleBooking.length} not booked</Pill>}>
              {data.vehicleBooking.length === 0
                ? <EmptyState>All draft delivery notes have transport details filled.</EmptyState>
                : <>
                    <Table
                      widths={['28%', '32%', '20%', '20%']}
                      head={['DN no.', 'Customer', 'Vehicle', 'LR no.']}
                      rows={data.vehicleBooking.slice(0, 10).map(v => (
                        <>
                          <td style={{ color: NAVY, fontWeight: 700, ...rowStripe(vehicleBookingTone(v)) }}>
                            <a href={erpUrl(`delivery-note/${encodeURIComponent(v.dnNo)}`)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{v.dnNo}</a>
                          </td>
                          <td title={v.customerName}>{v.customerName}</td>
                          <td>{v.vehicleNo ?? '—'}</td>
                          <td>{v.transporterReceiptNo ?? '—'}</td>
                        </>
                      ))}
                    />
                    {data.vehicleBooking.length > 10 && <ViewAllButton href={erpUrl('delivery-note?docstatus=0')} />}
                  </>
              }

              <div style={{ marginTop: 12 }}>
                <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 12, color: INK, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <i className="ti ti-file-certificate" style={{ color: ORANGE, fontSize: 15 }} />e-Way bill status
                </div>
                {ewayBills.length === 0
                  ? <EmptyState>No active e-way bills in the current window.</EmptyState>
                  : <>
                      <Table
                        widths={['28%', '24%', '24%', '24%']}
                        head={['e-Way bill', 'Party', 'Valid until', 'Status']}
                        rows={ewayBills.slice(0, 10).map(e => (
                          <>
                            <td style={{ color: NAVY, fontWeight: 700, ...rowStripe(ewayStatusTone(e.status)) }}>
                              <a href={erpUrl(`${e.linkedDoctype === 'Sales Invoice' ? 'sales-invoice' : 'delivery-note'}/${encodeURIComponent(e.linkedDoc)}`)}
                                target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}
                                title={`${e.linkedDoctype}: ${e.linkedDoc}`}>
                                {e.ewayBill}
                              </a>
                            </td>
                            <td title={e.party}>{e.party}</td>
                            <td>{fmtDate(e.validUpto)}</td>
                            <td style={{ overflow: 'visible' }}><Pill tone={ewayStatusTone(e.status)}>{e.status}</Pill></td>
                          </>
                        ))}
                      />
                      {ewayBills.length > 10 && <ViewAllButton href={erpUrl('e-waybill-log')} />}
                    </>
                }
              </div>
            </Card>
          </div>
        </div>

        {/* Zone 4 — This week's schedule | On-time dispatch trend */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <div style={{ flex: '1 1 420px' }}>
            <Card title="This week's dispatch schedule" icon="ti-calendar" fill
              right={<ViewAllInline href={erpUrl('delivery-note?docstatus=1')} />}>
              {data.scheduleThisWeek.length === 0
                ? <EmptyState>No delivery notes dispatched this week.</EmptyState>
                : data.scheduleThisWeek.map(s => {
                  const daysAway = Math.round((new Date(s.postingDate).getTime() - Date.now()) / 86_400_000)
                  const tone = daysAway <= 0
                    ? { bg: RED_BG, pill: 'd' as const, label: 'Today' }
                    : daysAway === 1
                      ? { bg: AMBER_BG, pill: 'w' as const, label: fmtDate(s.postingDate) }
                      : { bg: BG, pill: 'n' as const, label: fmtDate(s.postingDate) }
                  return (
                    <a key={s.dnNo} href={erpUrl(`delivery-note/${encodeURIComponent(s.dnNo)}`)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <div style={{ padding: '8px 10px', borderRadius: 9, background: tone.bg, display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                        <span style={{ width: 74, flexShrink: 0 }}><Pill tone={tone.pill}>{tone.label}</Pill></span>
                        <span style={{ flex: 1, fontSize: 10.5, color: INK2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <strong style={{ color: NAVY }}>{s.dnNo}</strong>, {s.customerName}{s.destinationCity ? `, ${s.destinationCity}` : ''} ({s.product})
                        </span>
                      </div>
                    </a>
                  )
                })
              }
            </Card>
          </div>

          <div style={{ flex: '1 1 420px' }}>
            <Card title="On-time dispatch — rolling 3 months" icon="ti-chart-bar" fill right={<span style={{ fontSize: 10, color: INK3 }}>Target 90%</span>}>
              {data.onTimeDispatch.length === 0
                ? <EmptyState>No completed dispatches with a promised date in the last 3 months.</EmptyState>
                : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round(70 * 90 / 100), height: 0, borderTop: `2px dashed ${ORANGE}`, opacity: 0.9 }} />
                    {data.onTimeDispatch.map(o => {
                      const h = Math.round(70 * o.onTimePct / 100)
                      const c = o.onTimePct >= 90 ? GREEN : o.onTimePct >= 80 ? AMBER : RED
                      return <div key={o.month} title={`${o.month}: ${o.onTimePct}%`} style={{ flex: 1, height: h, background: c, borderRadius: '4px 4px 0 0' }} />
                    })}
                  </div>
                )
              }
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: INK3, marginTop: 4 }}>
                {data.onTimeDispatch.map(o => <span key={o.month}>{o.month}</span>)}
              </div>
            </Card>
          </div>
        </div>

        {/* Zone 5 — Action queue (2 tabs) | Quick actions */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1.4 1 420px' }}>
            <Card title="Action queue" icon="ti-list-check">
              <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, gap: 2, marginTop: -4 }}>
                <AqTab label="DNs to submit" count={data.actionQueue.dnsToSubmit.length} on={aqTab === 0} onClick={() => setAqTab(0)} />
                <AqTab label="Invoices awaiting dispatch" count={data.actionQueue.invoicesAwaitingDispatch.length} on={aqTab === 1} onClick={() => setAqTab(1)} />
              </div>
              <div style={{ paddingTop: 12 }}>
                {aqTab === 0 && (
                  data.actionQueue.dnsToSubmit.length === 0
                    ? <EmptyState>No draft delivery notes have all documents complete yet.</EmptyState>
                    : <>
                        <Table
                          widths={['18%', '24%', '22%', '18%', '18%']}
                          head={['DN no.', 'Customer', 'Product', 'Target date', 'Value']}
                          rows={data.actionQueue.dnsToSubmit.map(r => (
                            <>
                              <td style={{ color: NAVY, fontWeight: 700 }}>
                                <a href={erpUrl(`delivery-note/${encodeURIComponent(r.dnNo)}`)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{r.dnNo}</a>
                              </td>
                              <td title={r.customerName}>{r.customerName}</td>
                              <td title={r.product}>{r.product}</td>
                              <td>{fmtDate(r.targetDate)}</td>
                              <td>{fmtMoney(r.value)}</td>
                            </>
                          ))}
                        />
                        <ViewAllButton href={erpUrl('delivery-note?docstatus=0')} />
                      </>
                )}
                {aqTab === 1 && (
                  data.actionQueue.invoicesAwaitingDispatch.length === 0
                    ? <EmptyState>No invoices are awaiting dispatch.</EmptyState>
                    : <>
                        <Table
                          widths={['18%', '24%', '16%', '16%', '26%']}
                          head={['Invoice no.', 'Customer', 'Amount', 'Date', 'Item']}
                          rows={data.actionQueue.invoicesAwaitingDispatch.slice(0, 10).map(r => (
                            <>
                              <td style={{ color: NAVY, fontWeight: 700 }}>
                                <a href={erpUrl(`sales-invoice/${encodeURIComponent(r.invoiceNo)}`)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{r.invoiceNo}</a>
                              </td>
                              <td title={r.customerName}>{r.customerName}</td>
                              <td>{fmtMoney(r.amount)}</td>
                              <td>{fmtDate(r.postingDate)}</td>
                              <td title={r.firstItem}>{r.firstItem}</td>
                            </>
                          ))}
                        />
                        <ViewAllButton href={erpUrl('sales-invoice?docstatus=1&update_stock=0')} />
                      </>
                )}
              </div>
            </Card>
          </div>

          <div style={{ flex: '1 1 320px' }}>
            <Card title="Quick actions" icon="ti-bolt">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <QuickAction icon="ti-file-plus" label="Create Delivery Note" href={erpUrl('delivery-note/new')} />
                <QuickAction icon="ti-file-certificate" label="Generate e-Way Bill" href={erpUrl('e-waybill-log/new')} />
                <QuickAction icon="ti-truck" label="Book Vehicle" href={erpUrl('delivery-note?docstatus=0')} />
                <QuickAction icon="ti-send" label="Submit Delivery Note" href={erpUrl('delivery-note?docstatus=0')} />
                <QuickAction icon="ti-check" label="Log Customer Receipt" href={erpUrl('delivery-note?docstatus=1&status=Completed')} disabled />
                <QuickAction icon="ti-checklist" label="Dispatch Checklist" href={erpUrl('delivery-note?docstatus=0')} disabled />
                <QuickAction icon="ti-file-invoice" label="Pending Invoices" href={erpUrl('sales-invoice?docstatus=1&update_stock=0')} />
                <QuickAction icon="ti-report" label="Dispatch Report" href={erpUrl('query-report/FG Dispatch Report')} />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function DocRow({ label, ok, manual, actionLabel, actionHref }: {
  label: string; ok?: boolean; manual?: boolean; actionLabel?: string; actionHref?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 11 }}>
      <span style={{ color: INK2 }}>{label}</span>
      {manual
        ? <span style={{ fontSize: 10, color: INK3 }}>Manual</span>
        : ok
          ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, color: GREEN }}>
              <i className="ti ti-circle-check" />Done
            </span>
          )
          : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-circle-x" style={{ color: RED }} />
              {actionLabel && actionHref
                ? (
                  <a href={actionHref} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    <button style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, cursor: 'pointer',
                      border: `1px solid ${NAVY}`, background: '#fff', color: NAVY,
                    }}>{actionLabel}</button>
                  </a>
                )
                : <span style={{ fontWeight: 700, color: RED }}>Pending</span>
              }
            </span>
          )
      }
    </div>
  )
}

function ViewAllInline({ href }: { href: string }) {
  return <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, fontWeight: 700, color: NAVY, textDecoration: 'none' }}>View all →</a>
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

function ViewAllButton({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'right', marginTop: 8, textDecoration: 'none' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#E06804' }}>View all ↗</span>
    </a>
  )
}

function QuickAction({ icon, label, href, disabled }: { icon: string; label: string; href: string; disabled?: boolean }) {
  const button = (
    <button style={{
      width: '100%', fontSize: 11, fontWeight: 700, padding: '9px 10px', borderRadius: 8,
      border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 7, textAlign: 'left',
    }}>
      <i className={`ti ${icon}`} style={{ color: ORANGE, fontSize: 15 }} />{label}
    </button>
  )
  if (disabled) return button
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
      {button}
    </a>
  )
}

const KPI_VALUE_COLOR: Record<string, string> = {
  [RED]: '#FF7A6B',
  [AMBER]: ORANGE,
  [GREEN]: '#4ADE80',
  [INFO]: '#7FA6FF',
}

function KpiTile({ label, value, sub, accent, href }: {
  label: string; value: string; sub: string; accent: string; href?: string
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
      {href && (
        <a href={href} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-end', marginTop: 'auto', textDecoration: 'none' }}>
          <button style={{
            fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 99, marginTop: 10,
            background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.22)', color: '#fff', cursor: 'pointer',
          }}>View all ↗</button>
        </a>
      )}
    </div>
  )
}
