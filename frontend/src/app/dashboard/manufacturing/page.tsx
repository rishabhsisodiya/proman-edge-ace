'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useManufacturingHomepage } from '@/hooks/useManufacturingHomepage'
import { useWorkOrderDetail } from '@/hooks/useWorkOrderDetail'
import type { PipelineStage, SubStage, PipelineOrder } from '@/types/manufacturing'
import api from '@/lib/dashboardsApi'
import { colors } from '@/lib/brand'
import { DashboardError } from '@/components/dashboards/DashboardError'

// Ported verbatim from PROMAN/frontend/src/app/home/manufacturing-head/page.tsx
// (client-approved design — do not restyle). Only 4 plumbing changes from the
// original: api import path, the pipeline-orders-all endpoint prefix, the
// dashboard-switcher route prefix (/home -> /dashboard), and the logout
// handler (uses our real cookie names + /login instead of proman_* + /).

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY       = colors.navy
const NAVY_DEEP  = colors.navyDeep
const NAVY_TINT  = colors.navyTint
const ORANGE     = colors.orange
const BG         = colors.navySoft
const BORDER     = colors.border
const INK        = colors.textPrimary
const INK2       = colors.textSecondary
const INK3       = colors.textDisabled
const GREEN      = colors.success
const GREEN_BG   = colors.successBg
const AMBER      = colors.warning
const AMBER_BG   = colors.warningBg
const RED        = colors.error
const RED_BG     = colors.errorBg
const HOLD_BG    = '#EEF0F3'
const HOLD_TX    = '#4B5563'

const RAG_BG:  Record<string, string> = { red: RED_BG,   amber: AMBER_BG, green: GREEN_BG, hold: HOLD_BG }
const RAG_TX:  Record<string, string> = { red: RED,      amber: AMBER,    green: GREEN,    hold: HOLD_TX }
const RAG_HEX: Record<string, string> = { red: RED, amber: AMBER, green: GREEN, hold: '#6B7280' }

const STAGE_COLORS: Record<string, string> = {
  S1: '#3a4080', S2: NAVY,       S3: GREEN,
  S4: '#6B4226', S5: '#4A235A',  S6: NAVY_DEEP,
  S7: '#7D6608', S8: '#185FA5',  S9: '#6E2C00',
}

const QUICK_ACTIONS = [
  { icon: 'ti-arrow-right',    label: 'Update WO stage',      path: 'work-order',                           primary: true  },
  { icon: 'ti-tool',           label: 'Log downtime',         path: 'downtime-entry/new-downtime-entry-1',  primary: false },
  { icon: 'ti-refresh',        label: 'Create rework',        path: 'work-order/new-work-order-1',          primary: false },
  { icon: 'ti-layout-kanban',  label: 'View pipeline',        path: 'work-order?status=In+Process',         primary: false },
  { icon: 'ti-package-off',    label: 'Shortage report',      path: 'material-request?status=Pending',      primary: false },
  { icon: 'ti-chart-bar',      label: 'Completion report',    path: 'work-order?status=Completed',          primary: false },
  { icon: 'ti-alert-triangle', label: 'Escalate to dispatch', path: 'delivery-note',                        primary: false },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function th(label: string) {
  return (
    <th key={label} style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px',
      color: INK3, textAlign: 'left', padding: '6px 7px',
      borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
    }}>{label}</th>
  )
}
function td(children: React.ReactNode, extra?: React.CSSProperties) {
  return (
    <td style={{ padding: '8px 7px', borderBottom: `1px solid ${BORDER}`, color: INK, verticalAlign: 'middle', ...extra }}>
      {children}
    </td>
  )
}
function Tag({ rag, label }: { rag: string; label: string }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
      background: RAG_BG[rag], color: RAG_TX[rag] }}>{label}</span>
  )
}
function Card({ children, style, hero, className }: { children: React.ReactNode; style?: React.CSSProperties; hero?: boolean; className?: string }) {
  return (
    <div className={className} style={{
      background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 11, padding: '13px 16px',
      boxShadow: hero ? '0 6px 22px rgba(255,118,4,.12)' : '0 1px 2px rgba(42,47,105,.05)',
      borderTop: hero ? `3px solid ${ORANGE}` : undefined,
      minWidth: 0, overflow: 'hidden', ...style,
    }}>{children}</div>
  )
}
function CardTitle({ icon, title, right }: { icon: string; title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 9,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 18, color: NAVY }} />
        {title}
      </div>
      {right}
    </div>
  )
}
function ViewAll({ href, label = 'View all ↗' }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ fontSize: 12, color: NAVY, textDecoration: 'none', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer' }}>
      {label}
    </a>
  )
}
function WOStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    'In Process':  { bg: GREEN_BG,   color: GREEN },
    'Not Started': { bg: AMBER_BG,   color: AMBER },
    'Stopped':     { bg: RED_BG,     color: RED   },
  }
  const s = cfg[status] ?? { bg: '#F3F4F6', color: '#6B7280' }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{status}</span>
  )
}
function ChBadge({ label, rag }: { label: string; rag: 'red' | 'amber' | 'green' }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99,
      background: RAG_BG[rag], color: RAG_TX[rag] }}>{label}</span>
  )
}

// ── Sub-stage chart ───────────────────────────────────────────────────────────
function SubStageChart({ stages }: { stages: SubStage[] }) {
  const ns = stages.map(s => ({ ...s, red: Number(s.red), amber: Number(s.amber), green: Number(s.green), hold: Number(s.hold) }))
  const SMAX = Math.max(...ns.map(s => s.red + s.amber + s.green + s.hold), 1)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 128, paddingTop: 4 }}>
        {ns.map((s, i) => {
          const tot = s.red + s.amber + s.green + s.hold
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, height: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column-reverse', width: '100%', flex: 1, gap: 2, minHeight: 0 }}>
                {([['green', s.green], ['hold', s.hold], ['amber', s.amber], ['red', s.red]] as [string, number][]).map(([key, count]) =>
                  count > 0 ? (
                    <div key={key} style={{ width: '100%', height: `${(count / SMAX) * 100}%`, background: RAG_HEX[key], borderRadius: 3, minHeight: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{count}</span>
                    </div>
                  ) : null
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{tot}</div>
              <div style={{ fontSize: 11, color: INK2, textAlign: 'center', lineHeight: 1.15, fontWeight: 600 }}>{s.label}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 11, justifyContent: 'center', marginTop: 9, fontSize: 11, color: INK2 }}>
        {[['Red', RAG_HEX.red], ['Amber', RAG_HEX.amber], ['Green', RAG_HEX.green], ['Hold', RAG_HEX.hold]].map(([l, c]) => (
          <span key={l}>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: c, verticalAlign: -1, marginRight: 3 }} />
            {l}
          </span>
        ))}
      </div>
    </>
  )
}

// ── Pipeline tile ─────────────────────────────────────────────────────────────
function PipelineTile({ s, onSelect }: { s: PipelineStage; onSelect: () => void }) {
  const total = s.red + s.amber + s.green + s.hold
  return (
    <div className="ptile" style={{ background: s.color || NAVY, cursor: 'pointer' }}
      onClick={onSelect}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(157deg,rgba(255,255,255,.14),rgba(255,255,255,0) 46%)', pointerEvents: 'none' }} />
      <div style={{ fontSize: 11, fontWeight: 700, opacity: .65, letterSpacing: '.8px' }}>{s.short}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, margin: '3px 0 8px', minHeight: 28 }}>{s.label}</div>
      <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{total}</div>
      <div style={{ display: 'flex', gap: 2, height: 4, marginTop: 8, borderRadius: 99, overflow: 'hidden' }}>
        {s.red   > 0 && <span style={{ flex: s.red,   background: RAG_HEX.red   }} />}
        {s.amber > 0 && <span style={{ flex: s.amber, background: RAG_HEX.amber }} />}
        {s.green > 0 && <span style={{ flex: s.green, background: RAG_HEX.green }} />}
        {s.hold  > 0 && <span style={{ flex: s.hold,  background: '#6B7280'     }} />}
        {total === 0  && <span style={{ flex: 1, background: 'rgba(255,255,255,.25)' }} />}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ManufacturingHeadHomepage() {
  const router        = useRouter()
  const notifRef      = useRef<HTMLDivElement>(null)
  const switcherRef   = useRef<HTMLDivElement>(null)
  const [showNotif,    setShowNotif]    = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const { user, isLoading: userLoading } = useCurrentUser()
  const { data, isLoading, isError, status, refresh } = useManufacturingHomepage()
  const [drawerWO, setDrawerWO]          = useState<string | null>(null)
  const [pipelineOpen, setPipelineOpen]  = useState(false)
  const [pipelinePage, setPipelinePage]  = useState(1)
  const [pipelineRows, setPipelineRows]  = useState<PipelineOrder[]>([])
  const [pipelineLoadingMore, setPipelineLoadingMore] = useState(false)
  const [pipelineHasMore, setPipelineHasMore] = useState(true)
  const [pipelineSearch, setPipelineSearch] = useState('')
  const [pipelineSearchActive, setPipelineSearchActive] = useState(false)
  const { detail: woDetail, isLoading: woLoading } = useWorkOrderDetail(drawerWO)
  const switcherOptions = [
    { label: 'Sales Head',       slug: 'sales'       },
    { label: 'Procurement Head', slug: 'procurement' },
    { label: 'Finance Head',     slug: 'finance'     },
    { label: 'Stores Head',      slug: 'stores'      },
    { label: 'Dispatch Head',    slug: 'dispatch'    },
  ]

  const fetchPipelineOrders = async (page: number, append: boolean, search = '') => {
    setPipelineLoadingMore(true)
    try {
      const q = search ? `&search=${encodeURIComponent(search)}` : ''
      const res = await api.get<{ success: boolean; data: PipelineOrder[] }>(`/api/v1/dashboards/manufacturing/pipeline-orders-all?page=${page}${q}`)
      const rows = res.data.data
      setPipelineRows(prev => append ? [...prev, ...rows] : rows)
      setPipelineHasMore(rows.length === 10)
      setPipelinePage(page)
    } finally {
      setPipelineLoadingMore(false)
    }
  }

  const togglePipeline = () => {
    if (pipelineOpen) {
      setPipelineOpen(false)
      setPipelineSearch('')
      setPipelineSearchActive(false)
    } else {
      setPipelineOpen(true)
      if (pipelineRows.length === 0) fetchPipelineOrders(1, false)
    }
  }

  const handlePipelineSearch = (val: string) => {
    if (!val.trim()) {
      setPipelineSearchActive(false)
      setPipelineSearch('')
      fetchPipelineOrders(1, false, '')
      return
    }
    setPipelineSearchActive(true)
    setPipelineSearch(val)
    fetchPipelineOrders(1, false, val.trim())
  }

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (notifRef.current    && !notifRef.current.contains(e.target as Node))    setShowNotif(false)
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setShowSwitcher(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (isLoading || userLoading) return <div style={{ padding: 40, fontSize: 13, color: INK3 }}>Loading dashboard…</div>
  if (isError) return <DashboardError status={status} onRetry={() => refresh()} />
  if (!data) return <div style={{ padding: 40, fontSize: 13, color: RED }}>Unable to load dashboard. Check middleware connection.</div>

  const erpBase  = data.erpBaseUrl.replace(/\/$/, '')
  const erpUrl   = (path: string) => `${erpBase}/app/${path}`
  const syncTime = new Date(data.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  const _now       = new Date()
  const _toDate    = _now.toISOString().slice(0, 10)
  const _fromDate  = new Date(_now.getFullYear(), _now.getMonth() - 1, _now.getDate()).toISOString().slice(0, 10)
  const _weekDay   = _now.getDay() === 0 ? 6 : _now.getDay() - 1  // Mon=0 … Sun=6
  const _weekMon   = new Date(_now); _weekMon.setDate(_now.getDate() - _weekDay)
  const _weekSun   = new Date(_weekMon); _weekSun.setDate(_weekMon.getDate() + 6)
  const _weekMonStr = _weekMon.toISOString().slice(0, 10)
  const _weekSunStr = _weekSun.toISOString().slice(0, 10)
  const _company   = encodeURIComponent('Proman Infrastructure Services Private Limited')

  const QUICK_ACTION_URLS: Record<string, string> = {
    'Update WO stage':      erpUrl('work-order'),
    'Log downtime':         erpUrl('downtime-entry/new-downtime-entry-1'),
    'Create rework':        erpUrl('quality-inspection?status=Rework'),
    'View pipeline':        erpUrl('manufacturing'),
    'Shortage report':      erpUrl(`query-report/Requested%20Items%20to%20Order%20and%20Receive?company=${_company}&from_date=${_fromDate}&to_date=${_toDate}`),
    'Completion report':    erpUrl('work-order/view/report?status=Completed'),
    'Escalate to dispatch': erpUrl('delivery-note/new-delivery-note-cqertjvrf'),
  }
  const { kpis, pipelineStages, delayedWOs, mfgSubStages, materialShortages, downtime, completingThisWeek, qualityRejections } = data

  // KPI definitions
  type KpiKey = 'red' | 'amber' | 'green' | 'hold'
  const KPI_DEFS = [
    { cls: '',        lbl: 'Active work orders', val: kpis.activeWOs.value,      kpi: kpis.activeWOs,      trendLabel: 'vs yesterday', rag: true  as const },
    { cls: 'k-green', lbl: 'Completed today',    val: kpis.completedToday.value, kpi: kpis.completedToday, trendLabel: 'vs yesterday', rag: false as const },
    { cls: 'k-red',   lbl: 'Delayed',            val: kpis.delayedRed.value,     kpi: kpis.delayedRed,     trendLabel: 'needs action', rag: false as const },
    { cls: 'k-amber', lbl: 'At risk',            val: kpis.atRiskAmber.value,    kpi: kpis.atRiskAmber,    trendLabel: 'monitor',      rag: false as const },
    { cls: 'k-hold',  lbl: 'On hold',            val: kpis.onHold.value,         kpi: kpis.onHold,         trendLabel: 'active holds', rag: false as const },
  ]
  const KPI_TOP: Record<string, string> = { '': '#C7C9DD', 'k-green': '#74C495', 'k-red': '#E07A7A', 'k-amber': '#E0A857', 'k-hold': '#A6ABBC' }

  // Notifications derived from data
  const notifItems = [
    ...delayedWOs.filter(w => w.rag === 'red' && w.daysOver >= 7).map(w => ({
      icon: 'ti-alert-triangle', text: `${w.wo} overdue ${w.daysOver} days`, sub: w.customer,
    })),
    ...(materialShortages.filter(s => s.rag === 'red').length > 0 ? [{
      icon: 'ti-package-off',
      text: `${materialShortages.filter(s => s.rag === 'red').length} WOs blocked on material`,
      sub: materialShortages.filter(s => s.rag === 'red').map(s => s.item).slice(0, 2).join(', '),
    }] : []),
  ]

  return (
    <>
      <style>{`
        .mfg-pg { font-family: Arial,'Arial Narrow',Helvetica,sans-serif; background: ${BG}; padding: 12px; min-height: 100vh; color: ${INK}; -webkit-font-smoothing: antialiased; }
        .mfg-inner { max-width: 1400px; margin: 0 auto; }
        .mfg-kpi-strip { display: grid; grid-template-columns: repeat(5,1fr); gap: 9px; position: relative; z-index: 1; }
        .mfg-pipe { display: grid; grid-template-columns: repeat(9,1fr); gap: 9px; }
        .mfg-row1 { display: grid; grid-template-columns: 1.2fr 1.6fr; gap: 11px; align-items: start; margin-bottom: 11px; }
        .mfg-sub2 { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; align-items: start; }
        .mfg-row2 { display: grid; grid-template-columns: 1.4fr 1fr max-content; gap: 11px; align-items: stretch; }
        .ptile { border-radius: 11px; padding: 11px 8px 10px; cursor: pointer; color: #fff; position: relative; overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,.14); transition: transform .14s ease, box-shadow .14s ease; }
        .ptile:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(0,0,0,.24); }
        .mfg-card { transition: box-shadow .16s ease, border-color .16s ease; }
        .mfg-card:hover { box-shadow: 0 8px 22px rgba(42,47,105,.10) !important; border-color: ${INK3} !important; }
        .mfg-card.hero:hover { box-shadow: 0 10px 30px rgba(255,118,4,.16) !important; }
        .tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .tbl th { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .3px; color: ${INK3};
          text-align: left; padding: 6px 7px; border-bottom: 1px solid ${BORDER}; white-space: nowrap; }
        .tbl td { padding: 8px 7px; border-bottom: 1px solid ${BORDER}; color: ${INK}; vertical-align: middle; }
        .tbl tr:last-child td { border-bottom: none; }
        .tbl tbody tr { cursor: pointer; }
        .tbl tbody tr:hover td { background: ${NAVY_TINT}; }
        .tbl tbody tr.lb-r td:first-child { box-shadow: inset 3px 0 0 ${RED}; }
        .tbl tbody tr.lb-a td:first-child { box-shadow: inset 3px 0 0 ${AMBER}; }
        .tbl tbody tr.lb-g td:first-child { box-shadow: inset 3px 0 0 ${GREEN}; }
        .tbl tbody tr.lb-h td:first-child { box-shadow: inset 3px 0 0 #6B7280; }
        .tbl-wrap { overflow-x: auto; }
        .action-btn { font-size: 12.5px; padding: 5px 12px; border-radius: 9px; border: 1px solid ${BORDER};
          background: #fff; color: ${INK}; cursor: pointer; text-align: left; display: inline-flex;
          align-items: center; gap: 7px; text-decoration: none; width: 100%;
          transition: background .12s, border-color .12s, box-shadow .12s; }
        .action-btn i { font-size: 18px; color: ${NAVY}; flex-shrink: 0; }
        .action-btn:hover { background: ${NAVY_TINT}; border-color: ${NAVY}; box-shadow: 0 3px 10px rgba(42,47,105,.10); }
        .action-btn.primary { background: linear-gradient(135deg,#FF8A2B 0%,${ORANGE} 100%);
          border-color: ${ORANGE}; color: #fff; box-shadow: 0 3px 10px rgba(255,118,4,.30); }
        .action-btn.primary i { color: #fff; }
        .action-btn.primary:hover { background: linear-gradient(135deg,#FF7E18 0%,#E96C00 100%); border-color: #E96C00; }
        .kpi-item { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.13);
          border-radius: 11px; padding: 9px 13px 7px; cursor: pointer;
          transition: transform .14s ease, border-color .14s ease, background .14s ease; backdrop-filter: blur(2px); }
        .kpi-item:hover { transform: translateY(-2px); border-color: rgba(255,255,255,.34); background: rgba(255,255,255,.12); }
        @media (max-width: 1100px) {
          .mfg-pipe { grid-template-columns: repeat(5,1fr); }
        }
        @media (max-width: 760px) {
          .mfg-kpi-strip { grid-template-columns: repeat(2,1fr); }
          .mfg-row1, .mfg-sub2, .mfg-row2 { grid-template-columns: 1fr; }
          .mfg-pipe { grid-template-columns: repeat(3,1fr); }
        }
      `}</style>

      <div className="mfg-pg">
        <div className="mfg-inner" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>

          {/* ── Topbar ── */}
          <div style={{
            background: NAVY, borderBottom: `2px solid ${ORANGE}`, borderRadius: 12,
            padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap', boxShadow: '0 6px 20px rgba(27,31,71,.22)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 19, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
                <i className="ti ti-building-factory-2" style={{ color: '#9AA0D8' }} />
                Good morning, {user?.fullName ?? '…'}
              </div>
              <div style={{ fontSize: 13, color: '#B9BEE0' }}>
                {user?.role ?? 'Manufacturing Head'}&nbsp;|&nbsp;
                {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                &nbsp;|&nbsp;Synced {syncTime}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
              <span style={{ background: ORANGE, color: '#fff', fontSize: 12.5, fontWeight: 700, padding: '5px 13px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-sun" /> Morning · 07:00–15:30
              </span>
              {/* Dashboard switcher */}
              <div style={{ position: 'relative' }} ref={switcherRef}>
                  <button onClick={() => setShowSwitcher(v => !v)}
                    style={{ fontSize: 11, color: '#fff', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-layout-grid" style={{ fontSize: 13 }} />
                    Switch dashboard
                  </button>
                  {showSwitcher && (
                    <div style={{ position: 'absolute', top: 34, right: 0, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(42,47,105,.15)', zIndex: 50, minWidth: 190, padding: 6 }}>
                      {switcherOptions.map(o => (
                        <button key={o.slug} onClick={() => router.push(`/dashboard/${o.slug}`)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 11.5, padding: '8px 11px', borderRadius: 7, border: 'none', background: 'none', color: INK, cursor: 'pointer' }}
                          onMouseOver={e => (e.currentTarget.style.background = NAVY_TINT)}
                          onMouseOut={e => (e.currentTarget.style.background = 'none')}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

              {/* Logout */}
              <button
                onClick={() => {
                  document.cookie = 'ace_token=; path=/; max-age=0'
                  document.cookie = 'ace_refresh=; path=/; max-age=0'
                  document.cookie = 'ace_user=; path=/; max-age=0'
                  router.push('/login')
                }}
                title="Logout"
                style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,80,80,.25)')}
                onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,.08)')}>
                <i className="ti ti-logout" style={{ fontSize: 14 }} />
                <span>Logout</span>
              </button>

              {/* Bell */}
              <div style={{ position: 'relative' }} ref={notifRef}>
                <button onClick={() => setShowNotif(v => !v)}
                  style={{ position: 'relative', fontSize: 11, color: '#fff', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>
                  </svg>
                  {notifItems.length > 0 && (
                    <span style={{ position: 'absolute', top: -6, right: -6, background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                      {notifItems.length}
                    </span>
                  )}
                </button>
                {showNotif && (
                  <div style={{ position: 'absolute', right: 0, top: 34, width: 300, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 12px 30px rgba(15,34,64,.18)', padding: 8, zIndex: 50 }}>
                    <h4 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: INK3, padding: '4px 6px 6px' }}>Needs attention</h4>
                    {notifItems.length === 0
                      ? <div style={{ padding: '7px 6px', fontSize: 11, color: INK3 }}>No active alerts</div>
                      : notifItems.map((n, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 6px', borderRadius: 7, fontSize: 11, color: INK, cursor: 'pointer' }}
                          onMouseOver={e => (e.currentTarget.style.background = NAVY_TINT)}
                          onMouseOut={e => (e.currentTarget.style.background = '')}>
                          <i className={`ti ${n.icon}`} style={{ fontSize: 15, color: RED, flexShrink: 0, marginTop: 1 }} />
                          <div>{n.text}<small style={{ display: 'block', color: INK2, fontSize: 10 }}>{n.sub}</small></div>
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Alert banner ── */}
          {data.alert && (
            <div style={{ background: RED_BG, border: `1px solid #E4B4B4`, borderRadius: 10, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, color: RED }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 20, flexShrink: 0 }} />
              <span><strong>{data.alert}</strong></span>
              <button
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10)
                  window.open(erpUrl(`work-order?docstatus=1&status=%5B%22in%22%2C%5B%22Not+Started%22%2C%22In+Process%22%2Cnull%5D%5D&expected_delivery_date=%5B%22%3C%22%2C%22${today}%22%5D`), '_blank')
                }}
                style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 12, fontWeight: 600, border: `1px solid currentColor`, background: 'none', color: 'inherit', borderRadius: 7, padding: '3px 10px', cursor: 'pointer' }}>Escalate</button>
            </div>
          )}

          {/* ── KPI band ── */}
          <div style={{ background: `linear-gradient(135deg,${NAVY} 0%,${NAVY_DEEP} 55%,#1b1f47 100%)`, borderRadius: 13, padding: '12px 14px 10px', position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)' }}>
            <div style={{ position: 'absolute', top: '-45%', right: '-6%', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,118,4,.12),transparent 68%)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, position: 'relative', zIndex: 1, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#C7CBEC', textTransform: 'uppercase', letterSpacing: '.4px' }}>Shop-floor snapshot</span>
              <span style={{ fontSize: 12, color: '#AAB0DC' }}>{kpis.activeWOs.value} active work orders · live to 5 min</span>
            </div>
            <div className="mfg-kpi-strip">
              {KPI_DEFS.map((k, i) => {
                const trendColor = k.kpi.trend
                  ? k.kpi.trend.dir === 'up'      ? '#86E5AC'
                  : k.kpi.trend.dir === 'down'    ? '#FFB0AC'
                  :                                 '#FCD9A0'
                  : '#AAB0DC'
                const trendText = k.kpi.trend
                  ? `${k.kpi.trend.delta} ${k.kpi.trend.label}`
                  : `— ${k.trendLabel}`
                return (
                  <div key={i} className="kpi-item" style={{ borderTop: `3px solid ${KPI_TOP[k.cls]}` }}>
                    <div style={{ fontSize: 12.5, color: '#C7CBEC', marginBottom: 5 }}>{k.lbl}</div>
                    <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 31, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{k.val}</div>
                    <div style={{ fontSize: 12, color: '#AAB0DC', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <span style={{ color: trendColor, fontWeight: 600 }}>{trendText}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#AAB0DC', marginTop: 2 }}>{k.kpi.sub}</div>
                    {k.rag && (
                      <div style={{ display: 'flex', height: 4, borderRadius: 99, overflow: 'hidden', marginTop: 6, gap: 1 }}>
                        {(['red','amber','green','hold'] as const).map(r =>
                          (kpis.activeWOs as Record<KpiKey, number>)[r] > 0
                            ? <span key={r} style={{ flex: (kpis.activeWOs as Record<KpiKey, number>)[r], background: RAG_HEX[r] }} />
                            : null
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Operations pipeline ── */}
          <Card className="mfg-card">
            <CardTitle icon="ti-layout-kanban" title="Operations pipeline · S1 to S9"
              right={
                <button onClick={togglePipeline} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: NAVY, padding: 0 }}>
                  {pipelineOpen ? 'Close pipeline ↑' : 'Open pipeline ↓'}
                </button>
              } />
            <div className="mfg-pipe">
              {pipelineStages.map((s) => (
                <PipelineTile key={s.short} s={{ ...s, color: STAGE_COLORS[s.short] ?? s.color }}
                  onSelect={() => window.open(`${erpBase}/app/order-pipeline?stage_name=${encodeURIComponent(JSON.stringify(['like', `%${s.label}%`]))}`, '_blank')} />
              ))}
            </div>

            {/* ── Inline expanded pipeline view ── */}
            {pipelineOpen && (() => {
              const STAGES = ['S1','S2','S3','S4','S5','S6','S7','S8','S9']
              const STAGE_LABELS: Record<string, string> = {
                S1:'Engineering', S2:'Prod Plan', S3:'Procurement', S4:'Vendor Dev',
                S5:'Stores', S6:'Manufacturing', S7:'Quality', S8:'Dispatch', S9:'Install',
              }
              return (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Search by Sales Order or Customer…"
                      value={pipelineSearch}
                      onChange={e => {
                        setPipelineSearch(e.target.value)
                        if (!e.target.value.trim() && pipelineSearchActive) handlePipelineSearch('')
                      }}
                      onKeyDown={e => e.key === 'Enter' && handlePipelineSearch(pipelineSearch)}
                      style={{ flex: 1, fontSize: 11, padding: '6px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, outline: 'none' }}
                    />
                    <button onClick={() => handlePipelineSearch(pipelineSearch)}
                      style={{ fontSize: 11, fontWeight: 600, padding: '6px 14px', borderRadius: 6, background: NAVY, color: '#fff', border: 'none', cursor: 'pointer' }}>
                      Search
                    </button>
                    {pipelineSearchActive && (
                      <button onClick={() => handlePipelineSearch('')}
                        style={{ fontSize: 11, padding: '6px 10px', borderRadius: 6, background: 'none', border: `1px solid ${BORDER}`, cursor: 'pointer', color: INK2 }}>
                        Clear
                      </button>
                    )}
                  </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl" style={{ fontSize: 11, minWidth: 900 }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 130 }}>Sales Order</th>
                        <th style={{ minWidth: 130 }}>Customer</th>
                        {STAGES.map(s => (
                          <th key={s} style={{ textAlign: 'center', minWidth: 72 }}>
                            <div style={{ fontSize: 9, color: INK3 }}>{s}</div>
                            <div style={{ fontSize: 9, fontWeight: 600 }}>{STAGE_LABELS[s]}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pipelineRows.map((o, i) => {
                        const minActiveIdx = Math.min(...o.activeStages.map(s => STAGES.indexOf(s)))
                        const maxActiveIdx = Math.max(...o.activeStages.map(s => STAGES.indexOf(s)))
                        const completed  = STAGES.slice(0, minActiveIdx)
                        const inBetween  = STAGES.filter((s, idx) => idx > minActiveIdx && idx < maxActiveIdx && !o.activeStages.includes(s))
                        return (
                          <tr key={i}>
                            <td style={{ padding: '6px 12px', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                              <a href={erpUrl(`sales-order/${encodeURIComponent(o.salesOrder)}`)} target="_blank" rel="noreferrer"
                                style={{ color: NAVY, fontWeight: 600, textDecoration: 'none' }}>
                                {o.salesOrder}
                              </a>
                            </td>
                            {td(o.customer,   { color: INK2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}
                            {STAGES.map(s => {
                              const isCompleted  = completed.includes(s)
                              const isActive     = o.activeStages.includes(s)
                              const isInBetween  = inBetween.includes(s)
                              return (
                                <td key={s} style={{ padding: '6px 4px', borderBottom: `1px solid ${BORDER}`, textAlign: 'center', verticalAlign: 'middle' }}>
                                  <div style={{
                                    width: 24, height: 24, borderRadius: '50%', margin: '0 auto',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, fontWeight: 700,
                                    background: isCompleted ? GREEN : isActive ? NAVY : '#D1D5DB',
                                    color: isInBetween ? ORANGE : '#fff',
                                    border: isActive ? `2px solid ${ORANGE}` : isInBetween ? `2px dashed ${ORANGE}` : 'none',
                                  }}>
                                    {isCompleted ? '✓' : isActive ? '●' : isInBetween ? '~' : ''}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {pipelineHasMore && (
                    <div style={{ textAlign: 'center', padding: '10px 0' }}>
                      <button
                        onClick={() => fetchPipelineOrders(pipelinePage + 1, true)}
                        disabled={pipelineLoadingMore}
                        style={{ fontSize: 11, fontWeight: 600, color: NAVY, background: 'none', border: `1px solid ${NAVY}`, borderRadius: 6, padding: '5px 16px', cursor: 'pointer' }}>
                        {pipelineLoadingMore ? 'Loading…' : 'View more ↓'}
                      </button>
                    </div>
                  )}
                  {!pipelineHasMore && pipelineRows.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, color: INK3 }}>All orders shown</div>
                  )}
                </div>
                </div>
              )
            })()}
          </Card>

          {/* ── Row 1: Delayed | right stack ── */}
          <div className="mfg-row1">
            <Card hero className="mfg-card hero">
              <CardTitle icon="ti-alert-circle"
                title={<>Delayed work orders <span style={{ fontSize: 11, color: INK3, fontWeight: 400 }}>red first</span></>}
                right={<ViewAll href={erpUrl('work-order?status=%5B%22not+in%22%2C%5B%22Closed%22%2C%22Cancelled%22%2C%22Draft%22%5D%5D')} />} />
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>WO No.</th><th>Customer</th><th>WO Status</th><th>Days over</th><th>Risk Status</th></tr></thead>
                  <tbody>
                    {delayedWOs.map((r, i) => (
                      <tr key={i} className={`lb-${r.rag === 'green' ? 'g' : r.rag}`} style={{ cursor: 'pointer' }} onClick={() => setDrawerWO(r.wo)}>
                        {td(r.wo, { color: NAVY, fontWeight: 600, whiteSpace: 'nowrap' })}
                        {td(r.customer, { maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: INK2 })}
                        {td(<WOStatusBadge status={r.status} />)}
                        {td(r.daysOver > 0 ? `${r.daysOver}d` : '—')}
                        {td(<Tag rag={r.rag} label={r.label} />)}
                      </tr>
                    ))}
                    {delayedWOs.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: '12px 7px', fontSize: 12, color: INK3, textAlign: 'center' }}>No delayed work orders</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
              <div className="mfg-sub2">
                <Card className="mfg-card" style={{ borderTop: `3px solid ${NAVY_DEEP}` }}>
                  <CardTitle icon="ti-chart-bar" title="Mfg sub-stages (S6)" />
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ minWidth: mfgSubStages.length * 56 }}>
                      <SubStageChart stages={mfgSubStages} />
                    </div>
                  </div>
                </Card>
                <Card className="mfg-card">
                  <CardTitle icon="ti-package-off" title="Material shortages"
                    right={<ChBadge label={`${materialShortages.filter(s => s.rag === 'red').length} blocking`} rag="red" />} />
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>MR</th><th>Item</th><th>Short</th><th>ETA</th></tr></thead>
                      <tbody>
                        {materialShortages.slice(0, 5).map((r, i) => (
                          <tr key={i} className={`lb-${r.rag}`} style={{ cursor: 'pointer' }}
                            onClick={() => window.open(erpUrl(`${r.wo.startsWith('MREQ') ? 'material-request' : 'work-order'}/${encodeURIComponent(r.wo)}`), '_blank')}>
                            {td(r.wo, { color: NAVY, fontWeight: 600 })}
                            {td(r.item, { color: INK2, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}
                            {td(r.short, { color: RAG_TX[r.rag], fontWeight: 700 })}
                            {td(r.eta, { color: INK2 })}
                          </tr>
                        ))}
                        {materialShortages.length === 0 && (
                          <tr><td colSpan={4} style={{ padding: '12px 7px', fontSize: 12, color: INK3, textAlign: 'center' }}>No shortages</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              <Card className="mfg-card">
                <CardTitle icon="ti-tool" title="Machine downtime — today"
                  right={<ChBadge label={`${downtime.totalHrs} hrs total`} rag={downtime.totalHrs > 4 ? 'red' : downtime.totalHrs > 2 ? 'amber' : 'green'} />} />
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Machine</th><th>Duration</th><th>Reason</th><th>Status</th></tr></thead>
                    <tbody>
                      {downtime.machines.map((m, i) => (
                        <tr key={i}>
                          {td(m.machine)}
                          {td(`${m.hrs} hr${m.hrs !== 1 ? 's' : ''}`)}
                          {td(m.reason, { color: INK2 })}
                          {td(<Tag rag={m.status === 'resolved' ? 'green' : 'amber'} label={m.status === 'resolved' ? 'Resolved' : 'Open'} />)}
                        </tr>
                      ))}
                      {downtime.machines.length === 0 && (
                        <tr><td colSpan={4} style={{ padding: '12px 7px', fontSize: 12, color: INK3, textAlign: 'center' }}>No downtime recorded today</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>

          {/* ── Row 2: Completing | Quality | Quick actions ── */}
          <div className="mfg-row2">
            <Card className="mfg-card">
              <CardTitle icon="ti-calendar-stats" title="WOs completing this week"
                right={<ViewAll href={erpUrl(`work-order?status=%5B%22not+in%22%2C%5B%22Closed%22%2C%22Cancelled%22%2C%22Draft%22%5D%5D&expected_delivery_date=%5B%22between%22%2C%5B%22${_weekMonStr}%22%2C%22${_weekSunStr}%22%5D%5D`)} />} />
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>WO No.</th><th>Customer</th><th>Product</th><th>Due</th><th>WO Status</th><th>Completion</th></tr></thead>
                  <tbody>
                    {completingThisWeek.map((r, i) => (
                      <tr key={i} className={`lb-${r.rag}`} style={{ cursor: 'pointer' }} onClick={() => setDrawerWO(r.wo)}>
                        {td(r.wo, { color: NAVY, fontWeight: 600, whiteSpace: 'nowrap' })}
                        {td(r.customer, { color: INK2, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}
                        {td(r.product, { color: INK2 })}
                        {td(r.due, { color: r.rag === 'red' ? RED : INK, fontWeight: r.rag === 'red' ? 700 : 400 })}
                        {td(<WOStatusBadge status={r.status} />)}
                        {td(<Tag rag={r.rag} label={r.rag === 'green' ? `${r.completion}% · on track` : r.rag === 'red' ? `${r.completion}% · overdue` : `${r.completion}% · watch`} />)}
                      </tr>
                    ))}
                    {completingThisWeek.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: '12px 7px', fontSize: 12, color: INK3, textAlign: 'center' }}>No WOs due this week</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="mfg-card" style={{ minWidth: 0 }}>
              <CardTitle icon="ti-shield-check" title="Quality rejections / rework — today"
                right={<ViewAll href={erpUrl('quality-inspection?status=Rejected')} label="Inspection log ↗" />} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
                <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 30, fontWeight: 700, lineHeight: 1, color: RED }}>{qualityRejections.rejections}</div>
                  <div style={{ fontSize: 12, color: INK2, marginTop: 4 }}>Rejections today</div>
                </div>
                <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 30, fontWeight: 700, lineHeight: 1, color: AMBER }}>{qualityRejections.rework}</div>
                  <div style={{ fontSize: 12, color: INK2, marginTop: 4 }}>Rework raised</div>
                </div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>WO No.</th><th>Product</th><th>Stage</th><th>Defect</th><th>Disposition</th></tr></thead>
                  <tbody>
                    {qualityRejections.items.map((r, i) => (
                      <tr key={i} className={`lb-${r.rag}`} style={{ cursor: 'pointer' }} onClick={() => setDrawerWO(r.wo)}>
                        {td(r.wo, { color: NAVY, fontWeight: 600 })}
                        {td(r.product, { color: INK2 })}
                        {td(r.stage, { color: INK2 })}
                        {td(r.defect)}
                        {td(<Tag rag={r.rag} label={r.disposition} />)}
                      </tr>
                    ))}
                    {qualityRejections.items.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: '12px 7px', fontSize: 12, color: INK3, textAlign: 'center' }}>No rejections today</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="mfg-card" style={{ minWidth: 180 }}>
              <CardTitle icon="ti-bolt" title="Quick actions" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {QUICK_ACTIONS.map(a => (
                  <a key={a.label} href={QUICK_ACTION_URLS[a.label] ?? erpUrl(a.path)} target="_blank" rel="noreferrer"
                    className={`action-btn${a.primary ? ' primary' : ''}`}
                    style={{ gridColumn: a.primary ? '1 / -1' : undefined }}>
                    <i className={`ti ${a.icon}`} />
                    {a.label}
                  </a>
                ))}
              </div>
            </Card>
          </div>

        </div>
      </div>

      {/* ── MR Detail Drawer ── */}

      {/* ── WO Detail Drawer ── */}
      {drawerWO && (
        <>
          <div onClick={() => setDrawerWO(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, background: '#fff', zIndex: 201, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,.15)' }}>
            {/* Header */}
            <div style={{ background: NAVY, padding: '18px 16px 14px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{drawerWO}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>
                    {woLoading ? 'Loading…' : woDetail?.customer ?? '—'}
                  </div>
                </div>
                <button onClick={() => setDrawerWO(null)}
                  style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
              {woDetail && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: woDetail.status === 'In Process' ? '#166534' : woDetail.status === 'Stopped' ? '#991B1B' : '#92600A', color: '#fff' }}>
                    {woDetail.status}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,.15)', color: '#fff' }}>
                    {woDetail.stage}
                  </span>
                </div>
              )}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {woLoading && <div style={{ fontSize: 12, color: INK3, textAlign: 'center', marginTop: 40 }}>Loading details…</div>}
              {!woLoading && woDetail && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 600, color: INK3, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Work order details</div>
                  {([
                    ['Product',       woDetail.product],
                    ['Qty ordered',   `${woDetail.producedQty} / ${woDetail.qty}`],
                    ['Completion',    `${woDetail.completion}%`],
                    ['Due date',      woDetail.dueDate],
                    ['Sales order',   woDetail.salesOrder || '—'],
                    ['Customer',      woDetail.customer],
                    ['Stage',         woDetail.stage],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ color: INK2 }}>{k}</span>
                      <span style={{ fontWeight: 500, maxWidth: 180, textAlign: 'right' }}>{v}</span>
                    </div>
                  ))}

                  {/* Progress bar */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: INK2, marginBottom: 4 }}>
                      <span>Completion progress</span><span style={{ fontWeight: 600 }}>{woDetail.completion}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 99, background: BORDER, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${woDetail.completion}%`, background: woDetail.completion >= 80 ? GREEN : woDetail.completion >= 50 ? AMBER : RED, borderRadius: 99 }} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8, flexShrink: 0 }}>
              <a href={erpUrl(`work-order/${encodeURIComponent(drawerWO)}`)} target="_blank" rel="noreferrer"
                style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '8px 0', borderRadius: 8, background: NAVY, color: '#fff', textAlign: 'center', textDecoration: 'none' }}>
                Open in ERPNext ↗
              </a>
              <a href={erpUrl(`job-card?work_order=${encodeURIComponent(drawerWO)}`)} target="_blank" rel="noreferrer"
                style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '8px 0', borderRadius: 8, background: 'none', border: `1px solid ${NAVY}`, color: NAVY, textAlign: 'center', textDecoration: 'none' }}>
                Job cards ↗
              </a>
            </div>
          </div>
        </>
      )}
    </>
  )
}
