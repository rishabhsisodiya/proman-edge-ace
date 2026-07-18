'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSalesHomepage } from '@/hooks/useSalesHomepage'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useQuotationDetail, extendQuotation, convertToSalesOrder, logFollowUp } from '@/hooks/useQuotationDetail'
import type { FunnelStage, FollowUpItem } from '@/types/sales'
import { colors } from '@/lib/brand'
import { formatMoney } from '@/lib/format'

// Ported verbatim from PROMAN/frontend/src/app/home/sales-head/page.tsx
// (client-approved design — do not restyle). Plumbing changes only: api
// import path (dashboardsApi, cookie auth), endpoint prefix (/dashboards/*),
// dashboard-switcher is now a flat list (no per-role SWITCHER_OPTIONS map,
// since our /auth/me doesn't return roleSlug) with /dashboard/* routes, the
// logout handler (our real cookie names + /login), and `companies` defaults
// to ['PISPL'] since per-user company assignment isn't wired into
// useCurrentUser yet (see project notes on the "9 entities" open item).

// Roles that can switch to other dashboards
const SWITCHER_OPTIONS: { label: string; slug: string }[] = [
  { label: 'Manufacturing Head', slug: 'manufacturing' },
  { label: 'Procurement Head',   slug: 'procurement'  },
  { label: 'Finance Head',       slug: 'finance'      },
  { label: 'Stores Head',        slug: 'stores'       },
  { label: 'Dispatch Head',      slug: 'dispatch'     },
]

// ── brand tokens ───────────────────────────────────────────────────────────
const NAVY       = colors.navy
const ORANGE     = colors.orange
const BORDER     = colors.border
const BG         = colors.navySoft
const TEXT       = colors.textPrimary
const TEXT2      = colors.textSecondary
const TEXT3      = colors.textDisabled
const HOVER      = colors.navyTint
const SUCCESS    = colors.success
const WARNING    = colors.warning
const ERROR      = colors.error
const WARNING_BG = colors.warningBg
const ERROR_BG   = colors.errorBg

// ── constants ──────────────────────────────────────────────────────────────
// Funnel: Navy shades (darkest → lighter shades → success green for Won)
const FCOL   = [NAVY, '#3D4490', '#5259A8', '#6B73B8', SUCCESS]
// KPI card top-border accent per card index (0=Enquiries,1=Quot,2=Orders,3=Conv,4=Revenue)
const ACCENT = [NAVY, WARNING, SUCCESS, WARNING, ORANGE]
const CARD_ORDER = [1, 3, 0, 2, 4]
const CARDS = [
  { base: 'Enquiries',        toggle: true  },
  { base: 'Quotations Open',  toggle: false },
  { base: 'Orders Confirmed', toggle: true  },
  { base: 'Conversion Rate',  toggle: false },
  { base: 'Revenue',          toggle: true  },
]
const SUFFIX: Record<string, string> = { month: 'MTD', q: 'QTD', ytd: 'YTD' }
// Dynamic labels — always based on today so they stay correct as time passes
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function buildMlab(): string[] {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    return MONTHS[d.getMonth()]
  })
}
function buildQlab(): string[] {
  const now  = new Date()
  const absQ = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) // absolute quarter
  return Array.from({ length: 4 }, (_, i) => {
    const q    = absQ - 3 + i
    const year = Math.floor(q / 4)
    const qi   = q % 4                    // 0-based quarter within year
    const endMonth = (qi + 1) * 3 - 1    // last month of that quarter (0-based)
    return MONTHS[endMonth] + "'" + String(year).slice(2)
  })
}
function buildYlab(): string[] {
  const y = new Date().getFullYear()
  return [String(y - 2), String(y - 1), String(y)]
}
const MLAB = buildMlab()
const QLAB = buildQlab()
const YLAB = buildYlab()
// Inject animation styles once at module load — avoids re-inserting on every render
if (typeof document !== 'undefined') {
  const id = 'proman-kpi-styles'
  if (!document.getElementById(id)) {
    const s = document.createElement('style')
    s.id = id
    s.textContent = `
      @keyframes barGrow { from { transform: scaleY(0) } to { transform: scaleY(1) } }
      .spark-bar { transform-origin: bottom; animation: barGrow .35s ease both; }
      .kpi-card { transition: transform .12s, box-shadow .12s; }
      .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.18); }
    `
    document.head.appendChild(s)
  }
}

// Spark value formatter per card index
const fmtRupee = formatMoney
const fmtCr = (v: number) => formatMoney(v * 1_00_00_000)
const SFMT: ((v: number) => string)[] = [
  v => String(v),
  v => String(v),
  fmtCr,          // Orders spark — values already in Cr
  v => `${v}%`,
  fmtCr,          // Revenue spark — values already in Cr
]
const QUICK_ACTIONS: { icon: string; label: string; path: string; primary: boolean }[] = [
  { icon: 'ti-file-dollar',  label: 'Create quotation',      path: 'quotation/new-quotation-1',             primary: true  },
  { icon: 'ti-pencil-plus',  label: 'Log enquiry',           path: 'lead/new-lead-1',                       primary: false },
  { icon: 'ti-phone',        label: 'Record follow-up',      path: 'communication',                         primary: false },
  { icon: 'ti-funnel',       label: 'View CRM pipeline',     path: 'crm',                                   primary: false },
  { icon: 'ti-circle-x',    label: 'Lost order analysis',   path: 'quotation?docstatus=1&status=Lost',     primary: false },
  { icon: 'ti-report',       label: 'Customer visit report', path: 'customer-visit/new-customer-visit-1',   primary: false },
  { icon: 'ti-checkup-list', label: 'KPI summary card',      path: 'workflow-action',                       primary: false },
  { icon: 'ti-chart-bar',    label: 'Target vs actuals',     path: 'query-report/Sales%20Performance',      primary: false },
]

type Period = 'month' | 'q' | 'ytd'

// ── helpers ────────────────────────────────────────────────────────────────
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) + amt
  const g = ((n >>  8) & 255) + amt
  const b = ( n        & 255) + amt
  const c = (x: number) => Math.max(0, Math.min(255, x))
  return '#' + (0x1000000 + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1)
}

function labelsFor(spark: number[], period: Period = 'month'): string[] {
  if (period === 'ytd') return YLAB.slice(0, spark.length)
  if (period === 'q')   return QLAB.slice(0, spark.length)
  return MLAB.slice(0, spark.length)
}

// ── SVG 3D funnel ──────────────────────────────────────────────────────────
function SvgFunnel({ funnel, onStage }: { funnel: FunnelStage[]; onStage: (s: string) => void }) {
  const CX = 200, H = 60, Y0 = 36
  // 6 boundary widths for 5 stages — uniform 50px step so all stages look like
  // equal slices of the same triangle (340 → 290 → 240 → 190 → 140 → 90).
  const ALL_W = [340, 290, 240, 190, 140, 90]
  const W: number[] = funnel.map((_, i) => ALL_W[i] ?? 90)
  W.push(ALL_W[funnel.length] ?? 90)
  const bow = W.map(w => w * 0.08)
  const svgH = Y0 + funnel.length * H + Math.round(bow[W.length - 1] * 2) + 10

  return (
    <svg viewBox={`0 0 580 ${svgH}`} style={{ width: '100%', height: 'auto', maxWidth: 640, display: 'block' }}>
      <defs>
        {funnel.map((_, i) => (
          <linearGradient key={i} id={`fg${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0"   stopColor={shade(FCOL[i], -26)} />
            <stop offset=".5"  stopColor={shade(FCOL[i],  46)} />
            <stop offset="1"   stopColor={shade(FCOL[i], -26)} />
          </linearGradient>
        ))}
      </defs>
      {/* open mouth */}
      <ellipse cx={CX} cy={Y0 + bow[0]}     rx={W[0] / 2}       ry={bow[0]}       fill="#E8EBF0" />
      <ellipse cx={CX} cy={Y0 + bow[0]}     rx={W[0] / 2 * 0.9} ry={bow[0] * 0.82} fill="#D7DCE4" />
      {funnel.map((r, i) => {
        const hT = W[i] / 2, hB = W[i + 1] / 2
        const yT = Y0 + i * H, yB = yT + H
        const prev = i > 0 ? funnel[i - 1].count : null
        const drop = prev !== null && prev > 0 ? Math.round(100 - (r.count / prev * 100)) : null
        const path = `M${CX - hT},${yT} Q${CX},${yT + 2 * bow[i]} ${CX + hT},${yT} L${CX + hB},${yB} Q${CX},${yB + 2 * bow[i + 1]} ${CX - hB},${yB} Z`
        return (
          <g key={i} onClick={() => onStage(r.stage)} style={{ cursor: 'pointer' }}>
            <path d={path} fill={`url(#fg${i})`} />
            <text x={CX} y={yT + H / 2 + bow[i] * 0.7 + 5} textAnchor="middle"
              fill="#fff" fontSize={i === funnel.length - 1 ? '11' : '13.5'} fontWeight="700"
              style={{ pointerEvents: 'none', letterSpacing: '.3px' }}>
              {r.stage} {r.count}
            </text>
            <text x={CX + hT + 14} y={yT + H / 2 + 10}
              fontSize="14.5" fontWeight="700" fill="#1A2433">
              {r.value != null ? `₹${r.value.toFixed(1)}Cr` : '—'}
              {drop !== null && <tspan dx="9" fontSize="11.5" fill="#C0392B">{drop}% drop</tspan>}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── page ──────────────────────────────────────────────────────────────────
export default function SalesHeadHomepage() {
  const router  = useRouter()
  const { user, isLoading: userLoading } = useCurrentUser()
  const companies = ['PISPL']

  const { data, isLoading, isError, refresh } = useSalesHomepage(companies)

  const [cardPeriods, setCardPeriods] = useState<Period[]>(['month', 'month', 'month', 'month', 'month'])
  const [funnelPeriod, setFunnelPeriod] = useState<Period>('month')
  const [activeTab, setActiveTab]       = useState(0)
  const [showBell, setShowBell]         = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [drawerDeal, setDrawerDeal]     = useState<FollowUpItem | null>(null)
  const [actionMsg, setActionMsg]       = useState<{ msg: string; url?: string } | null>(null)
  const [convertResult, setConvertResult] = useState<{ quotation: string; soName: string; soUrl: string } | null>(null)
  const [convertPrompt, setConvertPrompt] = useState<{ quotation: string; deliveryDate: string } | null>(null)
  const [followUpPrompt, setFollowUpPrompt] = useState<{ quotation: string; customer: string; message: string; sendEmail: boolean } | null>(null)
  const bellRef     = useRef<HTMLDivElement>(null)
  const actionQRef  = useRef<HTMLDivElement>(null)
  const switcherRef = useRef<HTMLDivElement>(null)

  const switcherOptions = SWITCHER_OPTIONS

  function erpUrl(path: string) {
    const base = (data?.erpBaseUrl ?? 'http://proman.localhost:8000').replace(/\/$/, '')
    return `${base}/app/${path}`
  }

  function goActionTab(tab: number) {
    setActiveTab(tab)
    actionQRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Load real quotation detail when drawer opens
  const { detail, isLoading: detailLoading } = useQuotationDetail(drawerDeal?.quotation ?? null)

  function toast(msg: string, url?: string) {
    setActionMsg({ msg, url })
    setTimeout(() => setActionMsg(null), 5000)
  }

  async function handleExtend(quotation: string) {
    try {
      const result = await extendQuotation(quotation, { days: 7 })
      toast(result.validTill ? `Validity extended to ${result.validTill}` : 'Validity extended by 7 days')
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      // Strip HTML tags from Frappe error messages
      const clean = raw.replace(/<[^>]+>/g, '').trim()
      toast(clean || 'Extend failed — check ERPNext connection')
    }
  }

  function handleLogFollowUp(quotation: string, customer: string, product?: string, validTill?: string) {
    const message =
      `Hi ${customer},\n\n` +
      `I am writing to follow up on Quotation ${quotation}` +
      `${product ? ` for ${product}` : ''}${validTill ? `, valid till ${validTill}` : ''}.\n\n` +
      `Could you please share an update on this, or let us know if you need any additional information from our side to move forward?\n\n` +
      `Looking forward to your response.\n\nBest regards,\nPISPL`
    setFollowUpPrompt({ quotation, customer, message, sendEmail: true })
  }

  async function doLogFollowUp() {
    if (!followUpPrompt) return
    const { quotation, message, sendEmail } = followUpPrompt
    setFollowUpPrompt(null)
    try {
      const result = await logFollowUp(quotation, message, sendEmail)
      toast(result.meta?.note ?? 'Follow-up logged')
      setDrawerDeal(null)
      refresh()
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      const clean = raw.replace(/<[^>]+>/g, '').trim()
      toast(clean || 'Follow-up failed — check ERPNext connection')
    }
  }

  function handleConvert(quotation: string) {
    const today = new Date().toISOString().slice(0, 10)
    setConvertPrompt({ quotation, deliveryDate: today })
  }

  async function doConvert() {
    if (!convertPrompt) return
    const { quotation, deliveryDate } = convertPrompt
    setConvertPrompt(null)
    try {
      const res = await convertToSalesOrder(quotation, deliveryDate)
      setDrawerDeal(null)
      if (res.salesOrder) {
        const soUrl = erpUrl(`sales-order/${encodeURIComponent(res.salesOrder)}`)
        setConvertResult({ quotation, soName: res.salesOrder, soUrl })
      } else {
        toast('Draft Sales Order created — check ERPNext to submit')
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      const friendly = raw.includes('Sales Team')
        ? `Cannot convert ${quotation} — Sales Team allocation is incomplete. Fix it in ERPNext and retry.`
        : raw.includes('mandatory') || raw.includes('missing')
        ? `Cannot convert ${quotation} — required fields are missing in the quotation.`
        : raw || 'Convert failed — check ERPNext connection'
      toast(friendly)
    }
  }

  useEffect(() => {
    function h(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setShowBell(false)
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setShowSwitcher(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (isLoading || userLoading) return <div className="p-10 text-sm text-gray-500">Loading dashboard…</div>
  if (isError || !data) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "Arial,'Helvetica Neue',Helvetica,sans-serif" }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 24px' }}>
        {/* Icon */}
        <div style={{ width: 64, height: 64, borderRadius: 16, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        {/* Heading */}
        <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
          Dashboard unavailable
        </div>
        {/* Message */}
        <div style={{ fontSize: 13.5, color: TEXT2, lineHeight: 1.6, marginBottom: 6 }}>
          Unable to reach the ERPNext server. This is usually a temporary issue with the API connection.
        </div>
        <div style={{ fontSize: 12, color: TEXT3, marginBottom: 28 }}>
          Error: 5xx — server did not respond
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={refresh}
            style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Retry
          </button>
          <button onClick={() => window.location.reload()}
            style={{ background: '#fff', color: NAVY, border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Reload page
          </button>
        </div>
        {/* Footer note */}
        <div style={{ marginTop: 32, fontSize: 11, color: '#B0B3CC' }}>
          If this persists, check with your system administrator that the ERPNext server is running.
        </div>
      </div>
    </div>
  )

  // A5 alert triggers
  const pct      = Math.round(data.revenueTarget.pct)
  const day      = data.decisionBand.day
  const dim      = data.decisionBand.daysInMonth
  const expToday = data.expiringQuotations.filter(q => q.validTill === 'Today').length
  const overdue7 = data.followUps.filter(f => f.daysOverdue > 7).length

  const alerts: { sev: 'red' | 'amber'; icon: string; text: string; action: string; tab: number }[] = []
  if (pct < 60 && day > 20)
    alerts.push({ sev: 'red', icon: 'ti-alert-octagon', text: `Revenue critically below target — ${pct}% achieved with ${dim - day} days remaining`, action: '', tab: -1 })
  if (expToday > 0)
    alerts.push({ sev: 'red', icon: 'ti-alert-triangle', text: `${expToday} quotations expire today. Extend or convert before end of day.`, action: 'Review', tab: 1 })
  if (overdue7 > 0)
    alerts.push({ sev: 'amber', icon: 'ti-bell-ringing', text: `${overdue7} quotations with no follow-up for over 7 days.`, action: 'Open queue', tab: 0 })

  // Bell notifications (A5 + conversion)
  const convMtd = parseFloat((data.kpis[3]?.value ?? '0').replace('%', ''))
  const bellItems: { color: string; title: string; sub: string }[] = [
    ...alerts.map(a => ({
      color: a.sev === 'red' ? '#EF4444' : WARNING,
      title: a.text.split('.')[0],
      sub:   a.text.split('.').slice(1).join('.').trim(),
    })),
    ...(convMtd < 25 ? [{ color: WARNING, title: 'Conversion rate below 25% this month', sub: 'Below 30-day average' }] : []),
  ]

  const monthName = new Date().toLocaleString('en', { month: 'long' })
  const syncTime  = new Date(data.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const _now      = new Date()
  const mtdFrom   = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-01`
  const mtdTo     = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
  const _weekEnd  = new Date(_now); _weekEnd.setDate(_now.getDate() + 7)
  const weekEndStr = `${_weekEnd.getFullYear()}-${String(_weekEnd.getMonth() + 1).padStart(2, '0')}-${String(_weekEnd.getDate()).padStart(2, '0')}`

  const funnel  = data.funnel[funnelPeriod]
  const rMax    = Math.max(...data.regionPipeline.map(r => r.quoted + r.negotiation + r.won))
  const gaugeR  = 49, gaugeCirc = 2 * Math.PI * gaugeR
  const gaugePct   = Math.min(pct, 100) // cap visual fill — value can exceed 100% but arc stays full
  const gaugeColor = pct >= 90 ? SUCCESS : pct >= 70 ? ORANGE : '#B42318'
  const sparkMax   = Math.max(...data.revenueTarget.trend.map(t => t.value))

  function setCard(idx: number, p: Period, e: React.MouseEvent) {
    e.stopPropagation()
    const next = [...cardPeriods] as Period[]
    next[idx] = p
    setCardPeriods(next)
  }

  return (
    <>
    <style>{`
      .sh-action-btn { font-size: 12.5px; padding: 5px 12px; border-radius: 9px; border: 1px solid ${BORDER};
        background: #fff; color: ${NAVY}; cursor: pointer; text-align: left; display: inline-flex;
        align-items: center; gap: 7px; text-decoration: none; width: 100%;
        transition: background .12s, border-color .12s, box-shadow .12s; }
      .sh-action-btn i { font-size: 18px; color: ${NAVY}; flex-shrink: 0; }
      .sh-action-btn:hover { background: ${HOVER}; border-color: ${NAVY}; box-shadow: 0 3px 10px rgba(42,47,105,.10); }
      .sh-action-btn.primary { background: linear-gradient(135deg,#FF8A2B 0%,${ORANGE} 100%);
        border-color: ${ORANGE}; color: #fff; box-shadow: 0 3px 10px rgba(255,118,4,.30); }
      .sh-action-btn.primary i { color: #fff; }
      .sh-action-btn.primary:hover { background: linear-gradient(135deg,#FF7E18 0%,#E96C00 100%); border-color: #E96C00; }

      /* ── Responsive layout ── */
      .sh-kpi-grid    { display: grid; grid-template-columns: repeat(5,1fr); gap: 9px; }
      .sh-row-funnel  { display: grid; grid-template-columns: 1.15fr .85fr; gap: 11px; }
      .sh-row-main    { display: grid; grid-template-columns: 1.6fr 1fr; gap: 11px; align-items: start; }
      .sh-quick-btns  { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

      @media (max-width: 1024px) {
        .sh-kpi-grid   { grid-template-columns: repeat(3,1fr); }
        .sh-row-funnel { grid-template-columns: 1fr; }
        .sh-row-main   { grid-template-columns: 1fr; }
      }
      @media (max-width: 600px) {
        .sh-kpi-grid   { grid-template-columns: repeat(2,1fr); }
        .sh-quick-btns { grid-template-columns: 1fr; }
      }
    `}</style>
    <div style={{ minHeight: '100vh', fontFamily: "Arial,'Helvetica Neue',Helvetica,sans-serif", background: BG, color: TEXT, WebkitFontSmoothing: 'antialiased', padding: 12 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 11 }}>

        {/* ── TOPBAR ── */}
        <div style={{ background: NAVY, borderBottom: `2px solid ${ORANGE}`, borderRadius: 12, padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', boxShadow: '0 6px 20px rgba(27,31,71,.22)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 19, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
              <i className="ti ti-trending-up" style={{ color: '#9AA0D8' }} />
              Good morning, {user?.fullName ?? '…'}
            </div>
            <div style={{ fontSize: 13, color: '#B9BEE0' }}>
              {user?.role ?? 'Sales Head'} &nbsp;|&nbsp;
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              &nbsp;|&nbsp; Synced {syncTime}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
            {/* Target chip */}
            <span style={{ background: ORANGE, color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 13px', borderRadius: 99, whiteSpace: 'nowrap' }}>
              {monthName} target: {pct}%
            </span>
            {/* Dashboard switcher — only for strategic roles */}
            {switcherOptions.length > 0 && (
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
                        style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 11.5, padding: '8px 11px', borderRadius: 7, border: 'none', background: 'none', color: NAVY, cursor: 'pointer' }}
                        onMouseOver={e => (e.currentTarget.style.background = HOVER)}
                        onMouseOut={e => (e.currentTarget.style.background = 'none')}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            <div style={{ position: 'relative' }} ref={bellRef}>
              <button onClick={() => setShowBell(v => !v)}
                style={{ position: 'relative', fontSize: 11, color: '#FFFFFF', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>
                </svg>
                <span style={{ position: 'absolute', top: -6, right: -6, background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                  {bellItems.length}
                </span>
              </button>
              {showBell && (
                <div style={{ position: 'absolute', right: 0, top: 34, width: 300, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 12px 30px rgba(15,34,64,.18)', padding: 8, zIndex: 40 }}>
                  <h4 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: TEXT3, padding: '4px 6px 6px' }}>Needs attention</h4>
                  {bellItems.length === 0
                    ? <div style={{ padding: '7px 6px', fontSize: 11 }}>No active alerts</div>
                    : bellItems.map((it, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 6px', borderRadius: 7, fontSize: 11, color: NAVY, cursor: 'pointer' }}
                        onMouseOver={e => (e.currentTarget.style.background = HOVER)}
                        onMouseOut={e => (e.currentTarget.style.background = '')}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, flexShrink: 0, marginTop: 4 }} />
                        <div>{it.title}<small style={{ display: 'block', color: TEXT2, fontSize: 10 }}>{it.sub}</small></div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── A5 ALERT STACK ── */}
        {alerts.map((a, i) => (
          <div key={i} style={{
            background: a.sev === 'red' ? ERROR_BG : WARNING_BG,
            border: `1px solid ${a.sev === 'red' ? '#FCA5A5' : '#F2DCAE'}`,
            borderRadius: 10, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 9,
            fontSize: 12, color: a.sev === 'red' ? '#991B1B' : '#92600A'
          }}>
            <i className={`ti ${a.icon}`} style={{ fontSize: 17, color: a.sev === 'red' ? '#B42318' : WARNING, flexShrink: 0 }} />
            <div dangerouslySetInnerHTML={{ __html: `<strong>${a.text.split('.')[0]}.</strong>${a.text.includes('.') ? ' ' + a.text.split('.').slice(1).join('.') : ''}` }} />
            {a.action && (
              <button onClick={() => goActionTab(a.tab)}
                style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10, fontWeight: 600, border: '1px solid currentColor', background: 'none', color: 'inherit', borderRadius: 7, padding: '3px 10px', cursor: 'pointer' }}>
                {a.action}
              </button>
            )}
          </div>
        ))}

        {/* ── KPI BAND ── */}
        <div style={{ background: `linear-gradient(135deg,${NAVY},${colors.navyDeep})`, borderRadius: 13, padding: '13px 14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Pipeline snapshot</span>
          </div>
          <div className="sh-kpi-grid">
            {CARD_ORDER.map(idx => {
              const card = CARDS[idx]
              const per  = card.toggle ? cardPeriods[idx] : 'month'
              const kpi  = card.toggle ? data.kpisAll[per][idx] : data.kpis[idx]
              if (!kpi) return null
              const spark  = kpi.spark ?? []
              const labels = labelsFor(spark, per)
              const mx     = Math.max(...spark, 1)
              const fmt    = SFMT[idx]
              const label  = card.base + (card.toggle ? ' ' + SUFFIX[per] : '')
              return (
                <div key={idx} className="kpi-card"
                  style={{ background: 'rgba(255,255,255,.07)', border: `1px solid rgba(255,255,255,.13)`, borderTop: `3px solid ${ACCENT[idx]}`, borderRadius: 11, padding: '11px 13px', cursor: 'pointer' }}
                  onMouseOver={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.3)')}
                  onMouseOut={e => (e.currentTarget.style.borderTopColor = ACCENT[idx])}>
                  {/* label row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: 'rgba(255,255,255,.6)', marginBottom: 5 }}>
                    <span>{label}</span>
                    {card.toggle && (
                      <span style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,.28)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                        {(['month', 'q', 'ytd'] as Period[]).map(p => (
                          <button key={p} onClick={e => setCard(idx, p, e)}
                            style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 6px', border: 'none', background: per === p ? NAVY : 'transparent', color: per === p ? '#fff' : 'rgba(255,255,255,.6)', cursor: 'pointer', lineHeight: 1.4 }}>
                            {p === 'month' ? 'M' : p === 'q' ? 'Q' : 'Y'}
                          </button>
                        ))}
                      </span>
                    )}
                    {!card.toggle && idx === 1 && (
                      <button onClick={() => window.open(erpUrl('quotation?docstatus=1&status=Open'), '_blank')} style={{ fontSize: 9, color: 'rgba(255,255,255,.6)', cursor: 'pointer', border: 'none', background: 'none', padding: 0, fontWeight: 600 }}>View all ↗</button>
                    )}
                    {!card.toggle && idx === 3 && convMtd < 25 && (
                      <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: WARNING_BG, color: '#92600A' }}>below 25%</span>
                    )}
                  </div>
                  {/* value */}
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: kpi.value }} />
                  {/* sub */}
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ color: kpi.direction === 'up' ? '#7FE0A8' : kpi.direction === 'dn' ? '#FFA8A8' : '#F2C078' }}>
                      {kpi.direction === 'up' ? '↑' : kpi.direction === 'dn' ? '↓' : ''}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,.6)' }}>{kpi.delta}</span>
                  </div>
                  {/* sparkline with value + month labels */}
                  {spark.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 54, marginTop: 8 }}>
                      {spark.map((v, j) => {
                        const isCur = j === spark.length - 1
                        return (
                          <div key={j} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 2, minWidth: 0 }}>
                            <span style={{ fontSize: 8, fontWeight: 600, color: '#FFFFFF', lineHeight: 1, whiteSpace: 'nowrap' }}>{fmt(v)}</span>
                            <div className="spark-bar" style={{ width: '100%', maxWidth: 26, background: isCur ? ORANGE : 'rgba(181,212,244,.42)', borderRadius: 2, height: Math.max(4, Math.round(28 * v / mx)), animationDelay: `${j * 40}ms` }} />
                            <span style={{ fontSize: 8, color: TEXT3, lineHeight: 1 }}>{labels[j] ?? ''}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── FUNNEL + GAUGE ── */}
        <div className="sh-row-funnel">
          {/* Funnel */}
          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 11, padding: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: NAVY }}>
                <i className="ti ti-filter" style={{ fontSize: 15, color: NAVY }} />
                Pipeline funnel &nbsp;<span style={{ fontSize: 11, fontWeight: 400, color: TEXT2 }}>{SUFFIX[funnelPeriod]}</span>
              </div>
              <span style={{ display: 'inline-flex', border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
                {(['month', 'q', 'ytd'] as Period[]).map(p => (
                  <button key={p} onClick={() => setFunnelPeriod(p)}
                    style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 6px', border: 'none', background: funnelPeriod === p ? NAVY : '#fff', color: funnelPeriod === p ? '#fff' : TEXT3, cursor: 'pointer', lineHeight: 1.4 }}>
                    {p === 'month' ? 'M' : p === 'q' ? 'Q' : 'Y'}
                  </button>
                ))}
              </span>
            </div>
            <SvgFunnel funnel={funnel} onStage={(s) => {
              const hit = data.followUps.find(f => f.stage === s)
              if (hit) setDrawerDeal(hit)
            }} />
            <div style={{ fontSize: 9.5, color: TEXT2, marginTop: 9 }}>
              <span style={{ color: '#C0392B', fontWeight: 700 }}>% drop</span> = fall from previous stage
            </div>
          </div>

          {/* Gauge */}
          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 11, padding: 13, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: NAVY, marginBottom: 11 }}>
              <i className="ti ti-target" style={{ fontSize: 15, color: NAVY }} />
              Monthly revenue target
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, flex: 1 }}>
              {/* Gauge ring */}
              <div style={{ position: 'relative', width: 118, height: 118 }}>
                <svg viewBox="0 0 118 118" width="118" height="118" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="59" cy="59" r="49" fill="none" stroke={BORDER} strokeWidth="11" />
                  <circle cx="59" cy="59" r="49" fill="none" stroke={gaugeColor} strokeWidth="11"
                    strokeDasharray={`${gaugeCirc} ${gaugeCirc}`}
                    strokeDashoffset={gaugeCirc * (1 - gaugePct / 100)}
                    strokeLinecap="round" />
                </svg>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: NAVY }}>{pct}%</div>
                  <div style={{ fontSize: 9.5, color: TEXT2 }}>₹{data.revenueTarget.achieved} / {data.revenueTarget.target}Cr</div>
                </div>
              </div>
              {/* Gauge note */}
              <div style={{ fontSize: 11, color: NAVY, textAlign: 'center' }}>
                Day {day} of {dim} · {dim - day} days remaining in {monthName} ·{' '}
                {pct > 100
                  ? <span style={{ color: SUCCESS, fontWeight: 700 }}>Target exceeded ✓</span>
                  : (() => {
                      const pacePct = Math.round(day / dim * 100)
                      const diff = pct - pacePct
                      return diff >= 0
                        ? <span style={{ color: SUCCESS, fontWeight: 700 }}>{diff}% ahead of pace</span>
                        : <span style={{ color: '#B42318', fontWeight: 700 }}>{-diff}% behind pace</span>
                    })()
                }
              </div>
              {/* Sparkline */}
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: 9, color: TEXT2, marginBottom: 4 }}>6-month revenue trend (₹Cr)</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                  {data.revenueTarget.trend.map((t, i) => {
                    const isCur = i === data.revenueTarget.trend.length - 1
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3, minWidth: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: NAVY, lineHeight: 1, whiteSpace: 'nowrap' }}>₹{t.value}</span>
                        <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: Math.round(46 * t.value / sparkMax), background: isCur ? ORANGE : 'rgba(42,47,105,.35)' }} />
                        <span style={{ fontSize: 9, color: TEXT2, lineHeight: 1 }}>{t.month}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── MAIN GRID: Action queue + Customers (left) | Region + Quick actions (right) ── */}
        <div className="sh-row-main">
          {/* LEFT colstack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
            {/* Action queue */}
            <div ref={actionQRef} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 11, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: NAVY }}>
                  <i className="ti ti-clock-hour-4" style={{ fontSize: 15, color: NAVY }} />
                  Action queue
                </div>
                <a href={erpUrl(
                    activeTab === 0 ? 'quotation?docstatus=1&status=Open' :
                    activeTab === 1 ? `quotation?docstatus=1&status=Open&valid_till=%5B%22Between%22%2C%5B%22${mtdTo}%22%2C%22${weekEndStr}%22%5D%5D` :
                                     `quotation?docstatus=1&status=Lost&modified=%5B%22Between%22%2C%5B%22${mtdFrom}%22%2C%22${mtdTo}%22%5D%5D`
                  )} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: NAVY, cursor: 'pointer', border: 'none', background: 'none', padding: 0, fontWeight: 500, textDecoration: 'none' }}>
                  View all ↗
                </a>
              </div>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, marginBottom: 9, flexWrap: 'wrap' }}>
                {[
                  { label: 'Follow-ups due today',          count: data.followUpsTotal,             bg: '#FCEBEB', color: '#991B1B' },
                  { label: 'Quotations expiring this week', count: data.expiringQuotations.length,  bg: WARNING_BG, color: '#92600A' },
                  { label: 'Lost orders this month',        count: data.lostDeals.deals.length,     bg: '#EEF0F3', color: TEXT2 },
                ].map((t, i) => (
                  <button key={i} onClick={() => setActiveTab(i)}
                    style={{ fontSize: 10.5, padding: '6px 12px', cursor: 'pointer', border: 'none', background: 'none', borderBottom: activeTab === i ? `2px solid ${NAVY}` : '2px solid transparent', color: activeTab === i ? NAVY : TEXT2, fontWeight: activeTab === i ? 600 : 400, whiteSpace: 'nowrap' }}>
                    {t.label}
                    <span style={{ borderRadius: 99, padding: '1px 6px', fontSize: 9, marginLeft: 4, background: t.bg, color: t.color }}>{t.count}</span>
                    {i === 1 && expToday > 0 && (
                      <span style={{ borderRadius: 99, padding: '1px 6px', fontSize: 9, marginLeft: 4, background: '#EF4444', color: '#fff' }}>{expToday} today</span>
                    )}
                  </button>
                ))}
              </div>
              {/* Tab content */}
              <div style={{ overflowX: 'auto' }}>
                {activeTab === 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                    <thead><tr>
                      {['Quotation', 'Customer', 'Product', 'Value', 'Days', ''].map(h => (
                        <th key={h} style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: TEXT3, textAlign: 'left', padding: '5px 7px', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.followUps.map((r, i) => (
                        <tr key={i} style={{ cursor: 'pointer', background: r.daysOverdue > 7 ? '#FFF8E6' : '' }}
                          onClick={() => setDrawerDeal(r)}
                          onMouseOver={e => { if (r.daysOverdue <= 7) e.currentTarget.style.background = HOVER }}
                          onMouseOut={e => { e.currentTarget.style.background = r.daysOverdue > 7 ? '#FFF8E6' : '' }}>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}`, color: NAVY, fontWeight: 600 }}>{r.quotation}</td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}` }}>{r.customer}</td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}`, color: TEXT2 }}>{r.product}</td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}`, fontVariantNumeric: 'tabular-nums' }}>{r.value}</td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}` }}>
                            <span style={{ fontSize: 8.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap', background: r.severity === 'red' ? '#FCEBEB' : r.severity === 'amber' ? WARNING_BG : '#DCFCE7', color: r.severity === 'red' ? '#991B1B' : r.severity === 'amber' ? '#92600A' : '#166534' }}>
                              {r.daysOverdue}d
                            </span>
                          </td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}` }}>
                            <button onClick={e => { e.stopPropagation(); handleLogFollowUp(r.quotation, r.customer, r.product, r.validTill) }}
                              style={{ fontSize: 9, padding: '3px 9px', borderRadius: 99, background: 'none', cursor: 'pointer', border: `1px solid ${NAVY}`, color: NAVY }}>
                              Log follow-up
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {activeTab === 1 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                    <thead><tr>
                      {['Quotation', 'Customer', 'Value', 'Valid till', ''].map(h => (
                        <th key={h} style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: TEXT3, textAlign: 'left', padding: '5px 7px', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.expiringQuotations.map((r, i) => (
                        <tr key={i} style={{ cursor: 'pointer' }}
                          onClick={() => setDrawerDeal({ quotation: r.quotation, customer: r.customer, product: '—', value: r.value, daysOverdue: 0, validTill: r.validTill, owner: '—', region: '—', stage: 'Quoted', severity: 'red', rank: i + 1 })}
                          onMouseOver={e => e.currentTarget.style.background = HOVER}
                          onMouseOut={e => e.currentTarget.style.background = ''}>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}`, color: NAVY, fontWeight: 600 }}>{r.quotation}</td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}` }}>{r.customer}</td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}`, fontVariantNumeric: 'tabular-nums' }}>{r.value}</td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}` }}>
                            <span style={{ fontSize: 8.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#FCEBEB', color: '#991B1B' }}>{r.validTill}</span>
                          </td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}` }}>
                            <button onClick={e => { e.stopPropagation(); handleExtend(r.quotation) }}
                              style={{ fontSize: 9, padding: '3px 9px', borderRadius: 99, background: 'none', cursor: 'pointer', border: `1px solid ${NAVY}`, color: NAVY, marginRight: 5 }}>
                              Extend
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleConvert(r.quotation) }}
                              style={{ fontSize: 9, padding: '3px 9px', borderRadius: 99, background: 'none', cursor: 'pointer', border: `1px solid ${ORANGE}`, color: ORANGE }}>
                              Convert
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {activeTab === 2 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                    <thead><tr>
                      {['Quotation', 'Customer', 'Value', 'Lost reason'].map(h => (
                        <th key={h} style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: TEXT3, textAlign: 'left', padding: '5px 7px', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.lostDeals.deals.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ cursor: 'pointer' }}
                          onClick={() => setDrawerDeal({ quotation: r.quotation, customer: r.customer, product: '—', value: r.value, daysOverdue: 0, validTill: '—', owner: '—', region: '—', stage: 'Lost', severity: 'red', rank: i + 1 })}
                          onMouseOver={e => e.currentTarget.style.background = HOVER}
                          onMouseOut={e => e.currentTarget.style.background = ''}>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}`, color: NAVY, fontWeight: 600 }}>{r.quotation}</td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}` }}>{r.customer}</td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}`, fontVariantNumeric: 'tabular-nums' }}>{r.value}</td>
                          <td style={{ padding: '6px 7px', borderBottom: `1px solid ${BORDER}`, color: TEXT2 }}>{r.lostReason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Top customers */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 11, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: NAVY }}>
                  <i className="ti ti-star" style={{ fontSize: 15, color: NAVY }} />
                  Top customers — order value MTD
                </div>
                <a href={erpUrl(`query-report/Sales%20Analytics?tree_type=Customer&based_on=Sales%20Order&from_date=${mtdFrom}&to_date=${mtdTo}`)} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: NAVY, fontWeight: 500, textDecoration: 'none' }}>
                  View all ↗
                </a>
              </div>
              <div>
                {data.topCustomers.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7, cursor: 'pointer', borderRadius: 6, padding: 2 }}
                    onMouseOver={e => e.currentTarget.style.background = HOVER}
                    onMouseOut={e => e.currentTarget.style.background = ''}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, width: 18, flexShrink: 0, textAlign: 'center' }}>{c.rank}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        <span style={{ fontWeight: 600, flexShrink: 0, marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{c.value}</span>
                      </div>
                      <div style={{ fontSize: 9, color: TEXT2 }}>{c.orders} orders · YTD {c.ytdValue} · last {c.lastOrder}</div>
                      <div style={{ height: 3, background: BORDER, borderRadius: 99, marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: NAVY, borderRadius: 99, width: `${c.barPct}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT colstack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
            {/* Region chart */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 11, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: NAVY, marginBottom: 11 }}>
                <i className="ti ti-map-pin" style={{ fontSize: 15, color: NAVY }} />
                Pipeline by region (₹L)
              </div>
              <div>
                <div style={{ display: 'flex', gap: 12, fontSize: 9, color: TEXT2, marginBottom: 8 }}>
                  {[[NAVY, 'Quoted'], [WARNING, 'Negotiation'], [SUCCESS, 'Won']].map(([c, l]) => (
                    <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: c }} />{l}
                    </span>
                  ))}
                </div>
                {data.regionPipeline.map((r, i) => {
                  const total = r.quoted + r.negotiation + r.won
                  const wq = Math.round(100 * r.quoted / rMax)
                  const wn = Math.round(100 * r.negotiation / rMax)
                  const ww = Math.round(100 * r.won / rMax)
                  return (
                    <div key={i} style={{ marginBottom: 6, borderRadius: 6, padding: 2 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: TEXT2, marginBottom: 3 }}>
                        <span>{r.region}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>₹{total}L</span>
                      </div>
                      <div style={{ display: 'flex', fontSize: 8.5, fontWeight: 700, margin: '2px 0', lineHeight: 1 }}>
                        {wq > 0 && <span style={{ color: NAVY,    width: `${wq}%`, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'clip' }}>{wq >= 8 ? `₹${r.quoted}L` : ''}</span>}
                        {wn > 0 && <span style={{ color: WARNING, whiteSpace: 'nowrap', minWidth: 'max-content', paddingRight: 5 }}>₹{r.negotiation}L</span>}
                        {ww > 0 && <span style={{ color: SUCCESS, whiteSpace: 'nowrap', minWidth: 'max-content', paddingRight: 5 }}>₹{r.won}L</span>}
                      </div>
                      <div style={{ display: 'flex', height: 11, borderRadius: 99, overflow: 'hidden', gap: 1 }}>
                        {wq > 0 && <div title={`Quoted: ₹${r.quoted}L`}           style={{ width: `${wq}%`, background: NAVY,    borderRadius: '99px 0 0 99px', cursor: 'default' }} />}
                        {wn > 0 && <div title={`Negotiation: ₹${r.negotiation}L`} style={{ width: `${wn}%`, background: WARNING, cursor: 'default' }} />}
                        {ww > 0 && <div title={`Won: ₹${r.won}L`}                 style={{ width: `${ww}%`, background: SUCCESS, borderRadius: '0 99px 99px 0', cursor: 'default' }} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 11, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: NAVY, marginBottom: 11 }}>
                <i className="ti ti-bolt" style={{ fontSize: 15, color: NAVY }} />
                Quick actions
              </div>
              <div className="sh-quick-btns">
                {QUICK_ACTIONS.map(a => (
                  <a key={a.label} href={erpUrl(a.path)} target="_blank" rel="noreferrer"
                    className={`sh-action-btn${a.primary ? ' primary' : ''}`}
                    style={{ gridColumn: a.primary ? '1 / -1' : undefined }}>
                    <i className={`ti ${a.icon}`} />
                    {a.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
      </div>

      {/* ── DEAL DRAWER ── */}
      {drawerDeal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,47,105,.3)', zIndex: 50 }}
            onClick={() => setDrawerDeal(null)} />
          <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 380, maxWidth: '92vw', background: '#fff', boxShadow: '-12px 0 40px rgba(42,47,105,.2)', zIndex: 51, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ background: NAVY, color: '#fff', padding: '15px 17px', position: 'relative' }}>
              <button style={{ position: 'absolute', top: 13, right: 14, color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontSize: 20, background: 'none', border: 'none' }}
                onClick={() => setDrawerDeal(null)}>×</button>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{drawerDeal.quotation}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>{drawerDeal.customer}</div>
            </div>
            {/* Body — shows skeleton then real detail once loaded */}
            <div style={{ padding: '15px 17px', overflowY: 'auto', flex: 1 }}>
              {detailLoading ? (
                <div style={{ color: TEXT3, fontSize: 11, paddingTop: 12 }}>Loading details…</div>
              ) : (
                <>
                  {/* Key-value pairs — prefer real detail, fall back to followUp data */}
                  {[
                    ['Product',              detail?.product     ?? drawerDeal.product],
                    ['Quotation value',      detail?.value       ?? drawerDeal.value],
                    ['Current stage',        detail?.status      ?? drawerDeal.stage],
                    ['Region',               detail?.region      ?? drawerDeal.region],
                    ['Valid till',           detail?.validTill   ?? drawerDeal.validTill],
                    ['Days since follow-up', `${detail?.daysOverdue ?? drawerDeal.daysOverdue}d`],
                    ['Owner',                detail?.owner       ?? drawerDeal.owner],
                    ...(detail?.contact ? [['Contact', detail.contact]] : []),
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ color: TEXT2 }}>{k}</span>
                      <span style={{ fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                  {/* Activity timeline */}
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: TEXT3, margin: '15px 0 8px' }}>Activity timeline</p>
                  <div style={{ position: 'relative', paddingLeft: 18, borderLeft: `2px solid ${BORDER}` }}>
                    {(detail?.timeline ?? [
                      { date: `${drawerDeal.daysOverdue}d ago`, event: `Quotation sent · ${drawerDeal.owner}` },
                      { date: `${Math.max(0, drawerDeal.daysOverdue - 2)}d ago`, event: 'Technical clarification shared' },
                      { date: 'No activity since', event: 'Awaiting customer response' },
                    ]).map((t, i, arr) => (
                      <div key={i} style={{ fontSize: 11, paddingBottom: 9, opacity: i === arr.length - 1 ? 0.5 : 1 }}>
                        <p style={{ fontWeight: 500 }}>{t.event}</p>
                        <p style={{ fontSize: 9.5, color: TEXT3, marginTop: 2 }}>{t.date}</p>
                      </div>
                    ))}
                  </div>
                  {/* Suggested next action */}
                  <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 9, padding: '10px 12px', fontSize: 11, color: '#9A3412', marginTop: 6 }}>
                    💡 {detail?.suggestedNextAction ?? (
                      drawerDeal.severity === 'red'
                        ? `No contact in ${drawerDeal.daysOverdue} days. Call today and extend validity before ${drawerDeal.validTill}.`
                        : `Follow up to keep momentum before validity lapses on ${drawerDeal.validTill}.`
                    )}
                  </div>
                  {/* Deep link to ERPNext */}
                  {detail?.deepLink && (
                    <a href={detail.deepLink} target="_blank" rel="noreferrer"
                      style={{ display: 'block', marginTop: 10, fontSize: 10, color: NAVY, textDecoration: 'underline' }}>
                      Open in ERPNext ↗
                    </a>
                  )}
                </>
              )}
            </div>
            {/* Footer actions */}
            <div style={{ padding: '13px 17px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
              <button onClick={() => drawerDeal && handleLogFollowUp(drawerDeal.quotation, drawerDeal.customer, detail?.product ?? drawerDeal.product, detail?.validTill ?? drawerDeal.validTill)}
                style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: 9, borderRadius: 9, cursor: 'pointer', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY }}>
                Log follow-up
              </button>
              <button onClick={() => detail?.deepLink && window.open(detail.deepLink, '_blank')}
                style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: 9, borderRadius: 9, cursor: 'pointer', border: `1px solid ${NAVY}`, background: NAVY, color: '#fff' }}>
                Open in ERPNext
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── TOAST ── */}
      {convertPrompt && (
        <>
          <div onClick={() => setConvertPrompt(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 300 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', borderRadius: 14, padding: 28, zIndex: 301, width: 340, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Convert to Sales Order</div>
            <div style={{ fontSize: 11.5, color: TEXT2, marginBottom: 16 }}>{convertPrompt.quotation}</div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TEXT2, display: 'block', marginBottom: 6 }}>Delivery Date</label>
            <input type="date" value={convertPrompt.deliveryDate}
              onChange={e => setConvertPrompt(p => p ? { ...p, deliveryDate: e.target.value } : p)}
              style={{ width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8, border: `1px solid ${BORDER}`, outline: 'none', boxSizing: 'border-box', marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConvertPrompt(null)}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: TEXT2 }}>
                Cancel
              </button>
              <button onClick={doConvert} disabled={!convertPrompt.deliveryDate}
                style={{ flex: 2, padding: '9px 0', borderRadius: 8, background: NAVY, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none' }}>
                Convert ↗
              </button>
            </div>
          </div>
        </>
      )}

      {followUpPrompt && (
        <>
          {/* Scrim */}
          <div onClick={() => setFollowUpPrompt(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(42,47,105,.32)', zIndex: 350 }} />
          {/* Side drawer */}
          <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 380, maxWidth: '92vw', background: '#fff', boxShadow: '-12px 0 40px rgba(42,47,105,.2)', zIndex: 351, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ background: NAVY, color: '#fff', padding: '15px 17px', position: 'relative' }}>
              <button onClick={() => setFollowUpPrompt(null)}
                style={{ position: 'absolute', top: 13, right: 14, color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontSize: 20, background: 'none', border: 'none' }}>×</button>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{followUpPrompt.quotation}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>Log follow-up · {followUpPrompt.customer}</div>
            </div>
            {/* Body */}
            <div style={{ padding: '15px 17px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 12, color: TEXT2, marginBottom: 8 }}>
                Review and send a follow-up email to the customer:
              </div>
              <div style={{ fontSize: 11, color: TEXT2, marginBottom: 4, fontWeight: 600 }}>Message</div>
              <textarea value={followUpPrompt.message} rows={10}
                onChange={e => setFollowUpPrompt(p => p ? { ...p, message: e.target.value } : p)}
                style={{ width: '100%', fontSize: 12, padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontFamily: 'Arial,sans-serif', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: TEXT2, marginTop: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={followUpPrompt.sendEmail}
                  onChange={e => setFollowUpPrompt(p => p ? { ...p, sendEmail: e.target.checked } : p)} />
                Email the customer
              </label>
            </div>
            {/* Footer */}
            <div style={{ padding: '13px 17px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
              <button onClick={() => setFollowUpPrompt(null)}
                style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: 9, borderRadius: 9, cursor: 'pointer', border: `1px solid ${BORDER}`, background: '#fff', color: TEXT2 }}>
                Cancel
              </button>
              <button onClick={doLogFollowUp} disabled={!followUpPrompt.message.trim()}
                style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: 9, borderRadius: 9, cursor: 'pointer', border: `1px solid ${ORANGE}`, background: ORANGE, color: '#fff', opacity: followUpPrompt.message.trim() ? 1 : .5 }}>
                {followUpPrompt.sendEmail ? 'Send email & log' : 'Log follow-up'}
              </button>
            </div>
          </div>
        </>
      )}

      {convertResult && (
        <>
          <div onClick={() => setConvertResult(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 300 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', borderRadius: 14, padding: 28, zIndex: 301, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,.25)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <i className="ti ti-circle-check" style={{ fontSize: 26, color: '#166534' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Sales Order Created</div>
            <div style={{ fontSize: 12, color: TEXT2, marginBottom: 4 }}>From quotation <strong>{convertResult.quotation}</strong></div>
            <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, background: '#F1F2FB', borderRadius: 8, padding: '8px 12px', margin: '12px 0 18px' }}>
              {convertResult.soName}
            </div>
            <div style={{ fontSize: 11.5, color: TEXT2, marginBottom: 20 }}>
              A draft Sales Order has been created in ERPNext. Open it to review and submit.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConvertResult(null)}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: TEXT2 }}>
                Close
              </button>
              <a href={convertResult.soUrl} target="_blank" rel="noreferrer" onClick={() => setConvertResult(null)}
                style={{ flex: 2, padding: '9px 0', borderRadius: 8, background: NAVY, color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                Open in ERPNext ↗
              </a>
            </div>
          </div>
        </>
      )}

      {actionMsg && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: NAVY, color: '#fff', fontSize: 12, padding: '10px 16px', borderRadius: 9, boxShadow: '0 10px 30px rgba(0,0,0,.25)', zIndex: 60, maxWidth: '90vw', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{actionMsg.msg}</span>
          {actionMsg.url && (
            <a href={actionMsg.url} target="_blank" rel="noreferrer"
              style={{ color: ORANGE, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Open ↗
            </a>
          )}
        </div>
      )}
    </div>
    </>
  )
}
