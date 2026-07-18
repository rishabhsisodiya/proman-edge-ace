'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  useProcurementHomepage,
  fetchPODetail,
  approvePO,
  returnPO,
  logFollowUp,
  makeGRN,
} from '@/hooks/useProcurementHomepage'
import { FiscalYearSelect } from '@/components/widgets/FiscalYearSelect'
import { currentFiscalYearStart } from '@/lib/fiscalYear'
import { colors } from '@/lib/brand'
import { formatMoney } from '@/lib/format'
import type {
  ApprovalQueueItem, OverduePO, CriticalShortage,
  VendorBar, VendorMode, SpendGauge, SpendCategory,
  ActionQueue, GrnPendingRow, FollowUpRow, InvoiceUnmatchedRow,
  ExpectedReceipt, PODetail, ProcurementActionResult,
  SparkPoint, Rag,
} from '@/types/procurement'

// Ported verbatim from PROMAN/frontend/src/app/home/procurement-head/page.tsx
// (client-approved design — do not restyle). Plumbing changes only: hook
// import paths (dashboardsApi/cookie auth), the dashboard-switcher is now a
// flat list (no per-role map) with /dashboard/* routes, and the logout
// handler uses our real cookie names + /login.

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY      = colors.navy
const NAVY_DEEP = colors.navyDeep
const NAVY_TINT = colors.navyTint
const ORANGE    = colors.orange
const BG        = colors.navySoft
const BORDER    = colors.border
const INK       = colors.textPrimary
const INK2      = colors.textSecondary
const INK3      = colors.textDisabled
const GREEN     = colors.success
const GREEN_BG  = colors.successBg
const AMBER     = colors.warning
const AMBER_BG  = colors.warningBg
const RED       = colors.error
const RED_BG    = colors.errorBg

const RAG_BG: Record<string, string> = { red: RED_BG,   amber: AMBER_BG, green: GREEN_BG }
const RAG_TX: Record<string, string> = { red: RED,      amber: AMBER,    green: GREEN    }
const RAG_HX: Record<string, string> = { red: RED,      amber: AMBER,    green: GREEN    }

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function weekEndISO() {
  const d = new Date(); d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

const ERP_URLS: Record<string, string> = {
  prPending:  '/app/purchase-order?workflow_state=Awaiting%20PM%20Approval',
  poOpen:     '/app/purchase-order?status=["in",["To Receive","To Receive and Bill"]]',
  poOverdue:  `/app/purchase-order?status=["in",["To Receive","To Receive and Bill"]]&per_received=["<",100]&schedule_date=["<","${todayISO()}"]`,
  critical:   '/app/bin',
  invoices:   '/app/purchase-invoice',
  grnDue:     '/app/purchase-order?status=["in",["To Receive","To Receive and Bill"]]&per_received=["<",100]',
  newPO:      '/app/purchase-order/new',
  newGRN:     '/app/purchase-receipt/new',
  scorecard:  '/app/supplier-scorecard',
  analytics:  '/app/purchase-analytics',
  budget:     '/app/procurement-budget',
  wo:         '/app/work-order?status=["in",["Not Started","In Process"]]',
}

function erpExpectedReceiptsUrl() {
  return `/app/purchase-order?status=["in",["To Receive","To Receive and Bill"]]&per_received=["<",100]&schedule_date=["between",["${todayISO()}","${weekEndISO()}"]]`
}

// ── Shared primitives ─────────────────────────────────────────────────────────

const fmtMoney = formatMoney

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function daysAgo(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function Tag({ rag, label }: { rag: Rag | string; label: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      whiteSpace: 'nowrap', background: RAG_BG[rag] ?? '#EEF0F3',
      color: RAG_TX[rag] ?? INK2,
    }}>{label}</span>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 11,
      padding: '13px 15px', display: 'flex', flexDirection: 'column',
      minWidth: 0, overflow: 'hidden', ...style,
    }}>{children}</div>
  )
}

function CardTitle({ icon, title, right, note }: {
  icon: string; title: string; right?: React.ReactNode; note?: string
}) {
  return (
    <div style={{
      fontSize: 13, fontWeight: 600, color: INK, marginBottom: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 16, color: ORANGE }} />
        {title}
        {note && <span style={{ fontSize: 10, color: INK3, fontWeight: 400 }}>{note}</span>}
      </div>
      {right}
    </div>
  )
}

function ViewAll({ href, label = 'View all ↗' }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ fontSize: 11, color: NAVY, textDecoration: 'none', fontWeight: 500 }}>
      {label}
    </a>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px',
      color: INK3, textAlign: 'left', padding: '5px 8px',
      borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
    }}>{children}</th>
  )
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: '7px 8px', borderBottom: `1px solid ${BORDER}`, color: INK, verticalAlign: 'middle', ...style }}>
      {children}
    </td>
  )
}

function MiniBtn({ onClick, children, variant = 'navy' }: {
  onClick: (e: React.MouseEvent) => void; children: React.ReactNode; variant?: 'navy' | 'orange' | 'amber' | 'grey'
}) {
  const colors: Record<string, string> = { navy: NAVY, orange: ORANGE, amber: AMBER, grey: INK3 }
  const c = colors[variant]
  return (
    <button onClick={onClick} style={{
      fontSize: 10, padding: '3px 9px', borderRadius: 99, background: 'none',
      border: `1px solid ${c}`, color: c, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

function ReceiptBar({ pct }: { pct: number | string }) {
  const n = Math.round(Math.min(100, Number(pct)))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 78 }}>
      <div style={{ flex: 1, height: 6, background: NAVY_TINT, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: 6, width: `${n}%`, background: NAVY, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 9, fontWeight: 600, color: INK2, width: 28, textAlign: 'right' }}>{n}%</span>
    </div>
  )
}

// ── KPI Sparkline bars ────────────────────────────────────────────────────────

function KpiSpark({ spark }: { spark: SparkPoint[] }) {
  if (!spark.length) return <div style={{ height: 64, marginTop: 5 }} />
  const max = Math.max(...spark.map(s => Number(s.value)), 1)
  const cur = spark.length - 1
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64, marginTop: 5 }}>
      {spark.map((s, i) => {
        const val = Number(s.value)
        const h = Math.max(4, Math.round(30 * val / max))
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: i === cur ? '#fff' : '#A9C2DC', lineHeight: 1 }}>
              {val.toLocaleString('en-IN')}
            </span>
            <div style={{
              width: '100%', maxWidth: 22, height: h,
              background: i === cur ? '#69B1FF' : 'rgba(181,212,244,.42)',
              borderRadius: 2,
            }} />
            <span style={{ fontSize: 8, color: '#8FA9C7', lineHeight: 1 }}>{s.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── ZONE 2: KPI Strip ─────────────────────────────────────────────────────────

function KpiStrip({ kpis, erpBase, onSpendModeChange, spendMode }: {
  kpis: NonNullable<ReturnType<typeof useProcurementHomepage>['data']>['kpis']
  erpBase: string
  spendMode: 'M' | 'Q' | 'Y'
  onSpendModeChange: (m: 'M' | 'Q' | 'Y') => void
}) {
  const clsColor: Record<string, string> = { navy: NAVY, amber: AMBER, red: RED, green: GREEN }
  const spendStat = kpis.spend.byMode[spendMode]

  // Derived context for colored sub text — matching template
  const criticalOverdue = Math.min(kpis.overduePOs.value, 99) // >7d shown as "X critical"
  const spendColor = spendStat
    ? spendStat.pct > 95 ? RED : spendStat.pct >= 75 ? AMBER : '#7FE0A8'
    : '#7FE0A8'

  type Tile = { label: string; value: number; cls: string; spark: SparkPoint[]; href: string; subEl: React.ReactNode }
  const tiles: Tile[] = [
    {
      label: 'POs pending approval', value: kpis.prsPending.value, cls: 'amber',
      spark: kpis.prsPending.spark, href: erpBase + ERP_URLS.prPending,
      subEl: <span style={{ color: '#F2C078' }}>{kpis.prsPending.value} awaiting approval</span>,
    },
    {
      label: 'Open POs', value: kpis.openPOs.value, cls: 'navy',
      spark: kpis.openPOs.spark, href: erpBase + ERP_URLS.poOpen,
      subEl: <span style={{ color: '#A9C2DC' }}>{fmtMoney(kpis.openPOs.openValue)} open value</span>,
    },
    {
      label: 'Overdue deliveries', value: kpis.overduePOs.value, cls: 'red',
      spark: kpis.overduePOs.spark, href: erpBase + ERP_URLS.poOverdue,
      subEl: <span style={{ color: '#FFA8A8' }}>{criticalOverdue} critical, &gt;7 days</span>,
    },
    {
      label: 'Critical stock alerts', value: kpis.criticalStock.value, cls: 'red',
      spark: kpis.criticalStock.spark, href: erpBase + ERP_URLS.critical,
      subEl: <span style={{ color: '#FFA8A8' }}>WO ends within 3 days</span>,
    },
  ]

  return (
    <div style={{ background: NAVY_DEEP, borderRadius: 13, padding: '13px 14px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#A9C2DC', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 9 }}>
        Procurement snapshot
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 9 }}>
        {tiles.map(t => (
          <div key={t.label} style={{
            background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.13)',
            borderTop: `3px solid ${clsColor[t.cls]}`, borderRadius: 11, padding: '11px 13px',
            cursor: 'pointer', transition: 'transform .12s, border-color .12s',
          }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = '')}>
            {/* Label row with View ↗ */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, gap: 4 }}>
              <span style={{ fontSize: 10.5, color: '#A9C2DC' }}>{t.label}</span>
              <a href={t.href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                style={{ fontSize: 9, fontWeight: 700, color: '#A9C2DC', background: 'rgba(255,255,255,.1)', borderRadius: 5, padding: '2px 6px', textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap' }}>
                View ↗
              </a>
            </div>
            <div style={{ fontFamily: 'Arial Black,Arial,sans-serif', fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
              {t.value.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 10, marginTop: 5 }}>{t.subEl}</div>
            <KpiSpark spark={t.spark} />
          </div>
        ))}

        {/* Spend vs budget tile with M/Q/Y toggle */}
        <div style={{
          background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.13)',
          borderTop: `3px solid ${spendColor}`,
          borderRadius: 11, padding: '11px 13px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 10.5, color: '#A9C2DC' }}>Spend vs budget</span>
            <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,.22)', borderRadius: 6, overflow: 'hidden' }}>
              {(['M','Q','Y'] as const).map(m => (
                <button key={m} onClick={() => onSpendModeChange(m)} style={{
                  fontSize: 8.5, fontWeight: 700, padding: '2px 7px', border: 'none', cursor: 'pointer', lineHeight: 1.4,
                  background: spendMode === m ? ORANGE : 'none',
                  color: spendMode === m ? '#fff' : '#A9C2DC',
                }}>{m}</button>
              ))}
            </div>
          </div>
          <div style={{ fontFamily: 'Arial Black,Arial,sans-serif', fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
            {spendStat ? `${spendStat.pct}%` : '—'}
          </div>
          <div style={{ fontSize: 10, marginTop: 5 }}>
            <span style={{ color: spendColor }}>
              {spendStat ? `${spendStat.label} · ${fmtMoney(spendStat.spent)} / ${fmtMoney(spendStat.budget)}` : ''}
            </span>
          </div>
          {spendStat && (
            <KpiSpark spark={spendStat.labels.map((l, i) => ({ label: l, value: Number(spendStat.vals[i] ?? 0) }))} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── ZONE 3a: PO Approval Queue ────────────────────────────────────────────────

function ApprovalQueue({ rows, erpBase, onRowClick, onApprove, onReturn }: {
  rows: ApprovalQueueItem[]
  erpBase: string
  onRowClick: (poNo: string) => void
  onApprove: (poNo: string) => void
  onReturn:  (poNo: string) => void
}) {
  return (
    <Card>
      <CardTitle
        icon="ti-file-check"
        title="PO approval queue"
        note="oldest first"
        right={<ViewAll href={erpBase + ERP_URLS.prPending} />}
      />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {['PO No.','Requester','Department','Item','Required by','Est. value','Days pending','Action'].map(h => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const leftColor = RAG_HX[p.rag]
              const soon = new Date(p.requiredBy).getTime() - Date.now() < 3 * 86_400_000
              return (
                <tr key={p.poNo} onClick={() => onRowClick(p.poNo)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = BG)}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <Td style={{ boxShadow: `inset 3px 0 0 ${leftColor}` }}>
                    <a href={`${erpBase}/app/purchase-order/${encodeURIComponent(p.poNo)}`}
                      target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ color: NAVY, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      {p.poNo}
                    </a>
                  </Td>
                  <Td style={{ color: INK2 }}>{p.requester}</Td>
                  <Td style={{ color: INK2 }}>{p.department}</Td>
                  <Td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.firstItem}
                  </Td>
                  <Td style={{ color: soon ? RED : INK, fontWeight: soon ? 700 : 400, whiteSpace: 'nowrap' }}>
                    {fmtDate(p.requiredBy)}{soon ? ' · soon' : ''}
                  </Td>
                  <Td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(p.estValue)}</Td>
                  <Td><Tag rag={p.daysPending > 5 ? 'amber' : 'green'} label={`${p.daysPending}d`} /></Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <MiniBtn variant="navy" onClick={e => { e.stopPropagation(); onApprove(p.poNo) }}>Approve</MiniBtn>
                      <MiniBtn variant="grey" onClick={e => { e.stopPropagation(); onReturn(p.poNo)  }}>Return</MiniBtn>
                    </div>
                  </Td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={8} style={{ padding: '20px 8px', color: INK3, fontSize: 12, textAlign: 'center' }}>No POs pending approval</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── ZONE 3b: GRNs Awaiting Invoice ───────────────────────────────────────────

function GRNsAwaitingInvoiceCard({ rows, erpBase }: { rows: InvoiceUnmatchedRow[]; erpBase: string }) {
  return (
    <Card>
      <CardTitle
        icon="ti-file-invoice"
        title="GRNs awaiting invoice"
        note="oldest first"
        right={<ViewAll href={erpBase + '/app/purchase-receipt?status=To%20Bill&is_return=0'} />}
      />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>{['GRN No.','Vendor','Amount','Linked PO','Age',''].map(h => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.grnNo}
                onMouseEnter={e => (e.currentTarget.style.background = BG)}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <Td style={{ boxShadow: `inset 3px 0 0 ${RAG_HX[r.rag]}` }}>
                  <a href={`${erpBase}/app/purchase-receipt/${encodeURIComponent(r.grnNo)}`} target="_blank" rel="noreferrer"
                    style={{ color: NAVY, fontWeight: 600, textDecoration: 'none' }}>{r.grnNo}</a>
                </Td>
                <Td style={{ color: INK2 }}>{r.supplier}</Td>
                <Td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(r.grandTotal)}</Td>
                <Td style={{ color: INK2, fontSize: 10 }}>
                  {r.linkedPo
                    ? <a href={`${erpBase}/app/purchase-order/${encodeURIComponent(r.linkedPo)}`} target="_blank" rel="noreferrer"
                        style={{ color: NAVY, textDecoration: 'none' }}>{r.linkedPo}</a>
                    : '—'}
                </Td>
                <Td><Tag rag={r.rag} label={`${r.daysSince}d`} /></Td>
                <Td>
                  <a href={`${erpBase}/app/purchase-invoice/new?purchase_receipt=${encodeURIComponent(r.grnNo)}`} target="_blank" rel="noreferrer">
                    <MiniBtn variant="grey" onClick={e => e.stopPropagation()}>Create Invoice</MiniBtn>
                  </a>
                </Td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} style={{ padding: '20px 8px', color: INK3, fontSize: 12, textAlign: 'center' }}>No GRNs awaiting invoice</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── ZONE 3b: Critical Material Shortage ──────────────────────────────────────

function CriticalShortageTable({ rows, erpBase }: { rows: CriticalShortage[]; erpBase: string }) {
  return (
    <Card>
      <CardTitle
        icon="ti-package-off"
        title="Critical material shortage"
        right={<ViewAll href={erpBase + ERP_URLS.wo} />}
      />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>{['WO','Item','Req','Avail','Short','ETA','WO end'].map(h => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((s, i) => (
              <tr key={i}
                onMouseEnter={e => (e.currentTarget.style.background = BG)}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <Td style={{ boxShadow: `inset 3px 0 0 ${RAG_HX[s.rag]}` }}>
                  <a href={`${erpBase}/app/work-order/${encodeURIComponent(s.woNo)}`}
                    target="_blank" rel="noreferrer"
                    style={{ color: NAVY, fontWeight: 600, textDecoration: 'none' }}>
                    {s.woNo}
                  </a>
                </Td>
                <Td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.blockedItem}
                </Td>
                <Td style={{ textAlign: 'right' }}>{Math.round(Number(s.requiredQty))}</Td>
                <Td style={{ textAlign: 'right' }}>{Math.round(Number(s.availableQty))}</Td>
                <Td style={{ textAlign: 'right', fontWeight: 700, color: RAG_HX[s.rag] }}>{Math.round(Number(s.shortfall))}</Td>
                <Td style={{ color: INK2, whiteSpace: 'nowrap' }}>{fmtDate(s.etaFromPO)}</Td>
                <Td style={{ color: s.rag === 'red' ? RED : INK, fontWeight: s.rag === 'red' ? 700 : 400, whiteSpace: 'nowrap' }}>
                  {fmtDate(s.plannedEndDate)}
                </Td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={7} style={{ padding: '20px 8px', color: INK3, fontSize: 12, textAlign: 'center' }}>No critical shortages</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── ZONE 4a: Vendor Delivery Performance ─────────────────────────────────────

function VendorPerformance({ data, mode, onModeChange, erpBase }: {
  data: Record<VendorMode, VendorBar[]>
  mode: VendorMode
  onModeChange: (m: VendorMode) => void
  erpBase: string
}) {
  // If selected mode has no data, auto-promote to Q then Y
  const effectiveMode = mode
  const rows = data[mode] ?? []
  return (
    <Card>
      <CardTitle
        icon="ti-star"
        title="Vendor delivery performance"
        note="top 10 by PO volume"
        right={
          <div style={{ display: 'inline-flex', border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
            {(['M','Q','Y'] as VendorMode[]).map(m => (
              <button key={m} onClick={() => onModeChange(m)} style={{
                fontSize: 9.5, fontWeight: 700, padding: '3px 10px', border: 'none', cursor: 'pointer',
                background: effectiveMode === m ? ORANGE : '#fff', color: effectiveMode === m ? '#fff' : INK2,
              }}>{m}</button>
            ))}
          </div>
        }
      />
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: INK3, textAlign: 'center', padding: '20px 0' }}>
          No vendor data for this period
        </div>
      ) : (
        rows.map(v => (
          <a key={v.supplier} href={`${erpBase}/app/supplier-scorecard`} target="_blank" rel="noreferrer"
            style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7,
              fontSize: 11, cursor: 'pointer', borderRadius: 6, padding: '2px 3px',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = BG)}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <span style={{ width: 130, flexShrink: 0, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.supplier}
              </span>
              <div style={{ flex: 1, height: 11, background: NAVY_TINT, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: 11, width: `${v.onTimePct}%`, background: RAG_HX[v.rag], borderRadius: 99 }} />
              </div>
              <span style={{ width: 36, fontSize: 9.5, fontWeight: 700, textAlign: 'right', color: RAG_HX[v.rag], flexShrink: 0 }}>
                {v.onTimePct}%
              </span>
            </div>
          </a>
        ))
      )}
      <div style={{ fontSize: 9.5, color: INK2, marginTop: 6 }}>
        <span style={{ color: GREEN, fontWeight: 700 }}>Green ≥85%</span>
        {' · '}
        <span style={{ color: AMBER, fontWeight: 700 }}>Amber 70–84%</span>
        {' · '}
        <span style={{ color: RED, fontWeight: 700 }}>Red &lt;70%</span>
        {' on-time delivery'}
      </div>
    </Card>
  )
}

// ── ZONE 4b: Spend vs Budget gauge ───────────────────────────────────────────

function SpendGaugeCard({ gauge, spendCat, onCatChange }: {
  gauge: SpendGauge
  spendCat: SpendCategory
  onCatChange: (c: SpendCategory) => void
}) {
  const cat = gauge.categoryBreakdown[spendCat]
  const pct = cat?.pct ?? 0
  const r   = 49
  const circ = 2 * Math.PI * r
  const arcColor = pct > 95 ? RED : pct >= 75 ? AMBER : GREEN
  const dashOffset = circ * (1 - Math.min(pct, 100) / 100)

  const trend = gauge.sixMonthTrend
  const maxTrend = Math.max(...trend.map(t => t.value), 1)
  const curIdx   = trend.length - 1

  const CAT_LABELS: Record<SpendCategory, string> = {
    all: 'All categories', raw: 'Raw Material', cons: 'Consumables', capex: 'Capex', serv: 'Services',
  }

  return (
    <Card>
      <CardTitle
        icon="ti-wallet"
        title="Spend vs budget"
        note="MTD"
        right={
          <select
            value={spendCat}
            onChange={e => onCatChange(e.target.value as SpendCategory)}
            style={{
              fontSize: 10, height: 23, padding: '0 6px', borderRadius: 6,
              border: `1px solid ${BORDER}`, background: '#fff', color: INK, cursor: 'pointer',
            }}>
            {(Object.entries(CAT_LABELS) as [SpendCategory, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        }
      />

      {/* Gauge ring */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, flex: 1, justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 118, height: 118 }}>
          <svg viewBox="0 0 118 118" width={118} height={118} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={59} cy={59} r={r} fill="none" stroke={BORDER} strokeWidth={11} />
            <circle cx={59} cy={59} r={r} fill="none" stroke={arcColor} strokeWidth={11}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Arial Black,Arial,sans-serif', fontSize: 24, fontWeight: 700, color: INK }}>
              {pct}%
            </div>
            <div style={{ fontSize: 9.5, color: INK2 }}>
              {fmtMoney(cat?.spent ?? 0)} / {fmtMoney(cat?.budget ?? 0)}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: INK, textAlign: 'center' }}>
          {CAT_LABELS[spendCat]} ·{' '}
          <span style={{ color: arcColor, fontWeight: 700 }}>
            {pct > 95 ? 'over budget' : pct >= 75 ? 'watch closely' : 'within budget'}
          </span>
        </div>

        {/* 6-month sparkline */}
        <div style={{ width: '100%' }}>
          <div style={{ fontSize: 9, color: INK2, marginBottom: 4 }}>6-month procurement spend (₹L)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64 }}>
            {trend.map((t, i) => {
              const h = Math.round(42 * t.value / maxTrend)
              const isCur = i === curIdx
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: INK, lineHeight: 1 }}>₹{t.value}</span>
                  <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: Math.max(4, h), background: isCur ? ORANGE : '#C7C9DD' }} />
                  <span style={{ fontSize: 9, color: INK2, lineHeight: 1 }}>{t.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── ZONE 5: Action Queue (3 tabs) ─────────────────────────────────────────────

const ACTION_TABS = ['GRNs pending today', 'PO follow-ups due', 'Overdue PO tracker'] as const

function ActionQueueCard({ queue, erpBase, overduePOs, onLogGRN, onLogFollowUp, onRowClick }: {
  queue: ActionQueue
  erpBase: string
  overduePOs: OverduePO[]
  onLogGRN:       (poNo: string) => void
  onLogFollowUp:  (poNo: string, supplier: string, scheduleDate: string) => void
  onRowClick:     (poNo: string) => void
}) {
  const [tab, setTab] = useState(0)

  const counts = [
    queue.grnsPending.length,
    queue.followUpsDue.length,
    overduePOs.length,
  ]
  const tabRag = [
    queue.grnsPending.length > 0 ? 'red'   : 'green',
    queue.followUpsDue.length > 0 ? 'amber' : 'green',
    overduePOs.some(p => p.rag === 'red') ? 'red' : overduePOs.length > 0 ? 'amber' : 'green',
  ]

  const ERP_LINKS = [
    erpBase + ERP_URLS.grnDue,
    erpBase + ERP_URLS.poOverdue,
    erpBase + ERP_URLS.poOverdue,
  ]

  return (
    <Card style={{ marginBottom: 11 }}>
      <CardTitle
        icon="ti-clock-hour-4"
        title="Action queue"
        right={<ViewAll href={ERP_LINKS[tab]} />}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, marginBottom: 9, flexWrap: 'wrap' }}>
        {ACTION_TABS.map((label, i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            fontSize: 10.5, padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === i ? ORANGE : 'transparent'}`,
            color: tab === i ? INK : INK2, fontWeight: tab === i ? 600 : 400,
            whiteSpace: 'nowrap',
          }}>
            {label}
            <span style={{
              borderRadius: 99, padding: '1px 6px', fontSize: 9, marginLeft: 4, fontWeight: 700,
              background: RAG_BG[tabRag[i]], color: RAG_TX[tabRag[i]],
            }}>{counts[i]}</span>
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        {tab === 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr>{['PO No.','Vendor','Item','Scheduled','% Recd',''].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>
              {queue.grnsPending.map((r: GrnPendingRow) => (
                <tr key={r.poNo}
                  onMouseEnter={e => (e.currentTarget.style.background = BG)}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <Td><a href={`${erpBase}/app/purchase-order/${encodeURIComponent(r.poNo)}`} target="_blank" rel="noreferrer"
                    style={{ color: NAVY, fontWeight: 600, textDecoration: 'none' }}>{r.poNo}</a></Td>
                  <Td style={{ color: INK2 }}>{r.supplier}</Td>
                  <Td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: INK2 }}>{r.firstItem}</Td>
                  <Td style={{ color: INK2, whiteSpace: 'nowrap' }}>{fmtDate(r.scheduleDate)}</Td>
                  <Td><ReceiptBar pct={r.perReceived} /></Td>
                  <Td>
                    <MiniBtn variant="orange" onClick={e => { e.stopPropagation(); onLogGRN(r.poNo) }}>Log GRN</MiniBtn>
                  </Td>
                </tr>
              ))}
              {!queue.grnsPending.length && (
                <tr><td colSpan={6} style={{ padding: '20px 8px', color: INK3, fontSize: 12, textAlign: 'center' }}>No GRNs pending</td></tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 1 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr>{['PO No.','Vendor','Overdue','Last follow-up',''].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>
              {queue.followUpsDue.map((r: FollowUpRow) => (
                <tr key={r.poNo}
                  onMouseEnter={e => (e.currentTarget.style.background = BG)}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <Td><a href={`${erpBase}/app/purchase-order/${encodeURIComponent(r.poNo)}`} target="_blank" rel="noreferrer"
                    style={{ color: NAVY, fontWeight: 600, textDecoration: 'none' }}>{r.poNo}</a></Td>
                  <Td style={{ color: INK2 }}>{r.supplier}</Td>
                  <Td><Tag rag={r.daysOverdue > 7 ? 'red' : 'amber'} label={`${r.daysOverdue}d`} /></Td>
                  <Td style={{ color: INK2, fontSize: 10 }}>{daysAgo(r.lastFollowup)}</Td>
                  <Td>
                    <MiniBtn variant="navy" onClick={e => { e.stopPropagation(); onLogFollowUp(r.poNo, r.supplier, r.scheduleDate) }}>Log</MiniBtn>
                  </Td>
                </tr>
              ))}
              {!queue.followUpsDue.length && (
                <tr><td colSpan={5} style={{ padding: '20px 8px', color: INK3, fontSize: 12, textAlign: 'center' }}>No follow-ups due</td></tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 2 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr>{['PO No.','Vendor','PO value','Scheduled','Overdue','% Recd','Last follow-up',''].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>
              {overduePOs.map(p => (
                <tr key={p.poNo} onClick={() => onRowClick(p.poNo)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = BG)}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <Td style={{ boxShadow: `inset 3px 0 0 ${RAG_HX[p.rag]}` }}>
                    <span style={{ color: NAVY, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.poNo}</span>
                  </Td>
                  <Td style={{ color: INK2 }}>{p.supplier}</Td>
                  <Td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(p.poValue)}</Td>
                  <Td style={{ color: INK2, whiteSpace: 'nowrap' }}>{fmtDate(p.scheduleDate)}</Td>
                  <Td><Tag rag={p.rag} label={`${p.daysOverdue}d`} /></Td>
                  <Td><ReceiptBar pct={p.perReceived} /></Td>
                  <Td style={{ color: INK2, fontSize: 10 }}>{daysAgo(p.lastFollowup)}</Td>
                  <Td>
                    <MiniBtn variant="amber" onClick={e => { e.stopPropagation(); onLogFollowUp(p.poNo, p.supplier, p.scheduleDate) }}>Log</MiniBtn>
                  </Td>
                </tr>
              ))}
              {!overduePOs.length && (
                <tr><td colSpan={8} style={{ padding: '20px 8px', color: INK3, fontSize: 12, textAlign: 'center' }}>No overdue POs</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}

// ── ZONE 6a: Expected Receipts This Week ─────────────────────────────────────

function ExpectedReceiptsCard({ rows, erpBase }: { rows: ExpectedReceipt[]; erpBase: string }) {
  const RAG_LABEL: Record<Rag, string> = { red: 'No confirmation', amber: 'Follow-up needed', green: 'On track' }

  return (
    <Card>
      <CardTitle
        icon="ti-calendar-event"
        title="Expected receipts this week"
        note="next 7 days"
        right={<ViewAll href={erpBase + erpExpectedReceiptsUrl()} />}
      />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>{['Vendor','PO No.','Expected','% Recd','Status'].map(h => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const daysUntil = Math.ceil((new Date(r.scheduleDate).getTime() - Date.now()) / 86_400_000)
              const urgent    = daysUntil <= 2
              return (
                <tr key={r.poNo}
                  onMouseEnter={e => (e.currentTarget.style.background = BG)}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <Td>{r.supplier}</Td>
                  <Td>
                    <a href={`${erpBase}/app/purchase-order/${encodeURIComponent(r.poNo)}`}
                      target="_blank" rel="noreferrer"
                      style={{ color: NAVY, fontWeight: 600, textDecoration: 'none' }}>
                      {r.poNo}
                    </a>
                  </Td>
                  <Td style={{ fontWeight: 700, color: NAVY, whiteSpace: 'nowrap' }}>
                    {fmtDate(r.scheduleDate)}
                    {urgent && (
                      <span style={{ marginLeft: 4, fontSize: 9, color: r.rag === 'red' ? RED : INK2, fontWeight: 700 }}>
                        · {daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil}d`}
                      </span>
                    )}
                  </Td>
                  <Td><ReceiptBar pct={r.perReceived} /></Td>
                  <Td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: RAG_HX[r.rag], flexShrink: 0 }} />
                      {RAG_LABEL[r.rag]}
                    </span>
                  </Td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={5} style={{ padding: '20px 8px', color: INK3, fontSize: 12, textAlign: 'center' }}>No receipts expected this week</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── ZONE 6b: Quick Actions ────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: 'ti-file-plus',    label: 'Create PO',        url: ERP_URLS.newPO     },
  { icon: 'ti-check',        label: 'Approve PR',       url: ERP_URLS.prPending },
  { icon: 'ti-package',      label: 'Log GRN',          url: ERP_URLS.newGRN    },
  { icon: 'ti-phone',        label: 'Vendor follow-up', url: ERP_URLS.poOverdue },
  { icon: 'ti-package-off',  label: 'Shortage report',  url: ERP_URLS.wo        },
  { icon: 'ti-star',         label: 'Vendor scorecard', url: ERP_URLS.scorecard },
  { icon: 'ti-chart-bar',    label: 'Spend analysis',   url: ERP_URLS.analytics },
  { icon: 'ti-report',       label: 'Budget vs actuals',url: ERP_URLS.budget    },
] as const

function QuickActionsCard({ erpBase }: { erpBase: string }) {
  return (
    <Card>
      <CardTitle icon="ti-bolt" title="Quick actions" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        {QUICK_ACTIONS.map(a => (
          <a key={a.label} href={erpBase + a.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div style={{
              fontSize: 10.5, padding: 9, borderRadius: 9, border: `1px solid ${BORDER}`,
              background: '#fff', color: INK, cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 7, transition: 'background .12s',
            }}
              onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = BG)}
              onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = '#fff')}>
              <i className={`ti ${a.icon}`} style={{ fontSize: 15, color: NAVY, flexShrink: 0 }} />
              {a.label}
            </div>
          </a>
        ))}
      </div>
    </Card>
  )
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

type DrawerState =
  | { type: 'closed' }
  | { type: 'loading'; poNo: string }
  | { type: 'detail'; po: PODetail }
  | { type: 'return'; poNo: string }
  | { type: 'followup'; poNo: string; supplier: string; scheduleDate: string }

function Drawer({ state, erpBase, onClose, onAction, toast }: {
  state: DrawerState
  erpBase: string
  onClose: () => void
  onAction: (poNo: string, action: 'approve' | 'return' | 'followup', extra?: string) => Promise<void>
  toast: (msg: string) => void
}) {
  const [returnReason, setReturnReason] = useState('')
  const [followupSubject, setFollowupSubject] = useState('')
  const [followupBody, setFollowupBody] = useState('')
  const [busy, setBusy] = useState(false)

  const isOpen = state.type !== 'closed'

  // Pre-fill email template when followup drawer opens
  useEffect(() => {
    if (state.type !== 'followup') return
    const { poNo, supplier, scheduleDate } = state
    const due = scheduleDate ? new Date(scheduleDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'
    setFollowupSubject(`Follow-up: Overdue Purchase Order ${poNo}`)
    setFollowupBody(
      `Hi ${supplier},\n\nI am writing to follow up on the status of Purchase Order ${poNo}, which was originally scheduled for delivery on ${due}.\n\nAccording to our system, this order is currently overdue and we have not yet received the shipment. Could you please look into this and provide us with an updated estimated time of arrival (ETA)?\n\nIf there are any issues or delays with fulfilling this order, please let us know as soon as possible so we can plan accordingly.\n\nBest regards,\nPISPL`
    )
  }, [state.type === 'followup' ? state.poNo : null])

  async function handleAction(action: 'approve' | 'return' | 'followup', extra?: string) {
    if (state.type !== 'detail' && state.type !== 'return' && state.type !== 'followup') return
    const poNo = state.type === 'detail' ? state.po.poNo : (state as { poNo: string }).poNo
    setBusy(true)
    await onAction(poNo, action, extra)
    setBusy(false)
  }

  return (
    <>
      {/* Scrim */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(15,34,64,.32)',
        opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'opacity .2s', zIndex: 50,
      }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100%', width: 380, maxWidth: '92vw',
        background: '#fff', boxShadow: '-12px 0 40px rgba(15,34,64,.2)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform .25s ease', zIndex: 51, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ background: NAVY, color: '#fff', padding: '15px 17px', position: 'relative' }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: 13, right: 14, color: '#A9C2DC',
            cursor: 'pointer', fontSize: 20, background: 'none', border: 'none',
          }}>×</button>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {state.type === 'loading' ? state.poNo : state.type === 'detail' ? state.po.poNo : state.type !== 'closed' ? state.poNo : ''}
          </div>
          <div style={{ fontSize: 11, color: '#A9C2DC', marginTop: 2 }}>
            {state.type === 'detail'
              ? `${state.po.supplier} · ${state.po.workflowState}`
              : state.type === 'return' ? 'Return PO to sender'
              : state.type === 'followup' ? 'Log vendor follow-up'
              : ''}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '15px 17px', overflowY: 'auto', flex: 1 }}>
          {state.type === 'loading' && (
            <div style={{ color: INK3, fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading…</div>
          )}

          {state.type === 'detail' && (() => {
            const po = state.po
            const kv = [
              ['Supplier',        po.supplier],
              ['Requester',       po.requester],
              ['Department',      po.department],
              ['Workflow state',  po.workflowState],
              ['PO value',        fmtMoney(po.grandTotal)],
              ['Required by',     fmtDate(po.scheduleDate)],
              ['% Received',      `${po.perReceived}%`],
              ['Last follow-up',  daysAgo(po.lastFollowup)],
            ]
            return (
              <>
                {kv.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '7px 0', borderBottom: `1px solid ${BORDER}`, gap: 10 }}>
                    <span style={{ color: INK2 }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: INK3, margin: '14px 0 8px' }}>Items</div>
                {po.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '5px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ color: INK2, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.itemName || it.itemCode}
                    </span>
                    <span style={{ fontWeight: 600 }}>{it.qty} {it.uom} · {fmtMoney(it.amount)}</span>
                  </div>
                ))}
                <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 9, padding: '10px 12px', fontSize: 11, color: '#9A3412', marginTop: 14, display: 'flex', gap: 7 }}>
                  <i className="ti ti-bulb" style={{ flexShrink: 0, fontSize: 15 }} />
                  <span>
                    {po.workflowState.includes('OPH')
                      ? 'This PO is awaiting your approval. Review the items and value before approving.'
                      : `This PO is in "${po.workflowState}" state. Check if your role can advance it.`}
                  </span>
                </div>
              </>
            )
          })()}

          {state.type === 'return' && (
            <>
              <div style={{ fontSize: 12, color: INK2, marginBottom: 10 }}>
                Provide a reason for returning this PO:
              </div>
              <textarea
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                rows={4}
                placeholder="e.g. Rate is too high, please re-quote…"
                style={{
                  width: '100%', fontSize: 12, padding: '8px 10px',
                  border: `1px solid ${BORDER}`, borderRadius: 8, color: INK,
                  fontFamily: 'Arial,sans-serif', resize: 'vertical',
                }}
              />
            </>
          )}

          {state.type === 'followup' && (
            <>
              <div style={{ fontSize: 12, color: INK2, marginBottom: 8 }}>
                Review and send a follow-up email to the vendor:
              </div>
              <div style={{ fontSize: 11, color: INK2, marginBottom: 4, fontWeight: 600 }}>Subject</div>
              <input
                value={followupSubject}
                onChange={e => setFollowupSubject(e.target.value)}
                style={{
                  width: '100%', fontSize: 12, padding: '7px 10px', marginBottom: 10,
                  border: `1px solid ${BORDER}`, borderRadius: 8, color: INK,
                  fontFamily: 'Arial,sans-serif',
                }}
              />
              <div style={{ fontSize: 11, color: INK2, marginBottom: 4, fontWeight: 600 }}>Message</div>
              <textarea
                value={followupBody}
                onChange={e => setFollowupBody(e.target.value)}
                rows={10}
                style={{
                  width: '100%', fontSize: 12, padding: '8px 10px',
                  border: `1px solid ${BORDER}`, borderRadius: 8, color: INK,
                  fontFamily: 'Arial,sans-serif', resize: 'vertical', lineHeight: 1.6,
                }}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '13px 17px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
          {state.type === 'detail' && (
            <>
              <button disabled={busy} onClick={() => handleAction('approve')} style={{
                flex: 1, fontSize: 12, fontWeight: 600, padding: 9, borderRadius: 9,
                cursor: 'pointer', border: `1px solid ${NAVY}`, background: NAVY, color: '#fff', opacity: busy ? .6 : 1,
              }}>Approve</button>
              <button disabled={busy} onClick={() => onAction(state.po.poNo, 'return')} style={{
                flex: 1, fontSize: 12, fontWeight: 600, padding: 9, borderRadius: 9,
                cursor: 'pointer', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY,
              }}>Return</button>
            </>
          )}
          {state.type === 'return' && (
            <>
              <button onClick={onClose} style={{
                flex: 1, fontSize: 12, fontWeight: 600, padding: 9, borderRadius: 9,
                cursor: 'pointer', border: `1px solid ${BORDER}`, background: '#fff', color: INK2,
              }}>Cancel</button>
              <button disabled={busy || !returnReason.trim()} onClick={() => handleAction('return', returnReason)} style={{
                flex: 1, fontSize: 12, fontWeight: 600, padding: 9, borderRadius: 9,
                cursor: 'pointer', border: `1px solid ${RED}`, background: RED, color: '#fff',
                opacity: busy || !returnReason.trim() ? .5 : 1,
              }}>Confirm return</button>
            </>
          )}
          {state.type === 'followup' && (
            <>
              <button onClick={onClose} style={{
                flex: 1, fontSize: 12, fontWeight: 600, padding: 9, borderRadius: 9,
                cursor: 'pointer', border: `1px solid ${BORDER}`, background: '#fff', color: INK2,
              }}>Cancel</button>
              <button
                disabled={busy || !followupSubject.trim() || !followupBody.trim()}
                onClick={() => handleAction('followup', JSON.stringify({ subject: followupSubject, message: followupBody }))}
                style={{
                  flex: 1, fontSize: 12, fontWeight: 600, padding: 9, borderRadius: 9,
                  cursor: 'pointer', border: `1px solid ${ORANGE}`, background: ORANGE, color: '#fff',
                  opacity: busy || !followupSubject.trim() || !followupBody.trim() ? .5 : 1,
                }}>Send email & log</button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: NAVY, color: '#fff', fontSize: 12, padding: '10px 18px',
      borderRadius: 9, boxShadow: '0 10px 30px rgba(0,0,0,.25)', zIndex: 60,
      maxWidth: '90vw', opacity: msg ? 1 : 0, transition: 'opacity .2s',
      pointerEvents: 'none',
    }}>{msg}</div>
  )
}

// Roles that can switch to other dashboards
const SWITCHER_OPTIONS: { label: string; slug: string }[] = [
  { label: 'Sales Head',         slug: 'sales'         },
  { label: 'Manufacturing Head', slug: 'manufacturing' },
  { label: 'Finance Head',       slug: 'finance'       },
  { label: 'Stores Head',        slug: 'stores'        },
  { label: 'Dispatch Head',      slug: 'dispatch'      },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProcurementHeadPage() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [fyStartYear, setFyStartYear] = useState(currentFiscalYearStart())
  const { data, isLoading, isError, refresh } = useProcurementHomepage(fyStartYear)

  const [spendMode, setSpendMode]   = useState<'M' | 'Q' | 'Y'>('M')
  const [vendorMode, setVendorMode] = useState<VendorMode>('Q')
  const [spendCat, setSpendCat]     = useState<SpendCategory>('all')
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [showNotif,    setShowNotif]    = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)
  const notifRef    = useRef<HTMLDivElement>(null)

  const switcherOptions = SWITCHER_OPTIONS

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setShowSwitcher(false)
      if (notifRef.current    && !notifRef.current.contains(e.target as Node))    setShowNotif(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const [drawer, setDrawer] = useState<DrawerState>({ type: 'closed' })
  const [toastMsg, setToastMsg] = useState('')

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2800)
  }, [])

  const openDrawer = useCallback(async (poNo: string) => {
    setDrawer({ type: 'loading', poNo })
    const po = await fetchPODetail(poNo)
    if (po) setDrawer({ type: 'detail', po })
    else { showToast('Could not load PO detail'); setDrawer({ type: 'closed' }) }
  }, [showToast])

  const handleAction = useCallback(async (
    poNo: string, action: 'approve' | 'return' | 'followup', extra?: string,
    meta?: { supplier?: string; scheduleDate?: string },
  ) => {
    if (action === 'return' && !extra) {
      setDrawer({ type: 'return', poNo }); return
    }
    if (action === 'followup' && !extra) {
      setDrawer({ type: 'followup', poNo, supplier: meta?.supplier ?? '', scheduleDate: meta?.scheduleDate ?? '' }); return
    }

    let result: ProcurementActionResult
    try {
      if (action === 'approve')       result = await approvePO(poNo)
      else if (action === 'return')   result = await returnPO(poNo, extra!)
      else                            result = await logFollowUp(poNo, extra!)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed — please try again'
      showToast(`⚠ ${msg}`); return
    }

    if (result.ok) {
      const s = result.summary
      const msg = typeof s === 'string' ? s
        : s && 'purchase_receipt' in s ? `GRN ${s.purchase_receipt} created`
        : s && 'logged_at' in s       ? `Follow-up logged`
        : 'Done'
      showToast(msg)
      setDrawer({ type: 'closed' })
      refresh()
    } else if (result.error?.code === 'WORKFLOW_NO_TRANSITION') {
      showToast('⚠ Old workflow state — advance directly in ERPNext')
      setDrawer({ type: 'closed' })
    } else {
      showToast(result.error?.message ?? 'Action failed')
    }
  }, [refresh, showToast])

  const erpBase = data?.erpBaseUrl ?? ''
  const today    = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const syncTime = data ? new Date(data.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''
  const notifItems = data ? data.alerts.map(a => ({
    icon: a.level === 'red' ? 'ti-alert-octagon' : 'ti-alert-triangle',
    text: a.message,
    link: a.erpLink,
  })) : []

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK2, fontSize: 14 }}>
        Loading procurement dashboard…
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

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "Arial,'Arial Narrow',Helvetica,sans-serif", padding: 12 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 11 }}>

        {/* ZONE 1: Top bar */}
        <div style={{
          background: NAVY, borderBottom: `2px solid ${ORANGE}`, borderRadius: 12,
          padding: '13px 18px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          boxShadow: '0 6px 20px rgba(27,31,71,.22)',
        }}>
          {/* Left: greeting + meta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 19, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
              <i className="ti ti-building-warehouse" style={{ color: '#9AA0D8' }} />
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.fullName ?? '…'}
            </div>
            <div style={{ fontSize: 13, color: '#B9BEE0' }}>
              Procurement Head&nbsp;|&nbsp;{today}&nbsp;|&nbsp;Synced {syncTime}
            </div>
          </div>

          {/* Right: actions */}
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
                {notifItems.length > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6, background: '#EF4444', color: '#fff',
                    fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 99,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  }}>{notifItems.length}</span>
                )}
              </button>
              {showNotif && (
                <div style={{
                  position: 'absolute', right: 0, top: 34, width: 300, background: '#fff',
                  border: `1px solid ${BORDER}`, borderRadius: 10,
                  boxShadow: '0 12px 30px rgba(15,34,64,.18)', padding: 8, zIndex: 50,
                }}>
                  <h4 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: INK3, padding: '4px 6px 6px', margin: 0 }}>Needs attention</h4>
                  {notifItems.length === 0
                    ? <div style={{ padding: '7px 6px', fontSize: 11, color: INK3 }}>No active alerts</div>
                    : notifItems.map((n, i) => (
                      <a key={i} href={n.link} target="_blank" rel="noreferrer" style={{
                        display: 'flex', gap: 8, padding: '7px 6px', borderRadius: 7,
                        fontSize: 11, color: INK, textDecoration: 'none',
                      }}
                        onMouseOver={e => (e.currentTarget.style.background = NAVY_TINT)}
                        onMouseOut={e  => (e.currentTarget.style.background = '')}>
                        <i className={`ti ${n.icon}`} style={{ fontSize: 15, color: RED, flexShrink: 0, marginTop: 1 }} />
                        <div style={{ fontSize: 11, lineHeight: 1.4 }}>{n.text}</div>
                      </a>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alert banners */}
        {data.alerts.map((a, i) => (
          <div key={i} style={{
            background: a.level === 'red' ? RED_BG : AMBER_BG,
            border: `1px solid ${a.level === 'red' ? '#E4B4B4' : '#F2DCAE'}`,
            borderRadius: 10, padding: '9px 14px', display: 'flex', alignItems: 'center',
            gap: 9, fontSize: 12,
            color: a.level === 'red' ? RED : AMBER,
          }}>
            <i className={`ti ${a.level === 'red' ? 'ti-alert-octagon' : 'ti-alert-triangle'}`} style={{ fontSize: 17 }} />
            <span style={{ flex: 1 }}>{a.message}</span>
            <a href={a.erpLink} target="_blank" rel="noreferrer" style={{
              fontSize: 10, fontWeight: 600, border: '1px solid currentColor',
              background: 'none', color: 'inherit', borderRadius: 7, padding: '3px 10px',
              textDecoration: 'none', flexShrink: 0,
            }}>Review</a>
          </div>
        ))}

        {/* ZONE 2: KPI strip */}
        <KpiStrip
          kpis={data.kpis}
          erpBase={erpBase}
          spendMode={spendMode}
          onSpendModeChange={setSpendMode}
        />

        {/* ZONE 3a: Approval queue */}
        <ApprovalQueue
          rows={data.approvalQueue}
          erpBase={erpBase}
          onRowClick={openDrawer}
          onApprove={poNo => handleAction(poNo, 'approve')}
          onReturn={poNo  => handleAction(poNo, 'return')}
        />

        {/* ZONE 3b: GRNs awaiting invoice + Shortage side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 11 }}>
          <GRNsAwaitingInvoiceCard rows={data.actionQueue.invoicesUnmatched} erpBase={erpBase} />
          <CriticalShortageTable rows={data.criticalShortages} erpBase={erpBase} />
        </div>

        {/* ZONE 4: Vendor performance + Spend gauge */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 11 }}>
          <VendorPerformance
            data={data.vendorPerformance}
            mode={vendorMode}
            onModeChange={setVendorMode}
            erpBase={erpBase}
          />
          <SpendGaugeCard
            gauge={data.spendGauge}
            spendCat={spendCat}
            onCatChange={setSpendCat}
          />
        </div>

        {/* ZONE 5: Action queue */}
        <ActionQueueCard
          queue={data.actionQueue}
          erpBase={erpBase}
          overduePOs={data.overduePOs}
          onRowClick={openDrawer}
          onLogGRN={async poNo => {
            const result = await makeGRN(poNo)
            if (result.ok) {
              const s = result.summary
              const msg = typeof s === 'string' ? s
                : s && 'purchase_receipt' in s ? `GRN ${s.purchase_receipt} created`
                : 'GRN created'
              showToast(msg); refresh()
            }
            else showToast(result.error?.message ?? 'GRN failed')
          }}
          onLogFollowUp={(poNo, supplier, scheduleDate) => handleAction(poNo, 'followup', undefined, { supplier, scheduleDate })}
        />

        {/* ZONE 6: Expected receipts + Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 11 }}>
          <ExpectedReceiptsCard rows={data.expectedReceipts} erpBase={erpBase} />
          <QuickActionsCard erpBase={erpBase} />
        </div>

      </div>

      <Drawer
        state={drawer}
        erpBase={erpBase}
        onClose={() => setDrawer({ type: 'closed' })}
        onAction={handleAction}
        toast={showToast}
      />
      <Toast msg={toastMsg} />
    </div>
  )
}
