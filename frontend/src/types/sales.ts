export interface KPI {
  label: string
  value: string
  delta: string
  direction: 'up' | 'dn' | 'neu'
  color: string
  spark: number[]
}

export interface FunnelStage {
  stage: string
  count: number
  value: number | null
  avgDays: number | null
  isStalling: boolean
  dropPct: number | null
}

export interface AttentionItem {
  type: 'expiring' | 'followup' | 'conversion'
  count: string
  title: string
  sub: string
  severity: 'red' | 'amber' | 'green'
}

export interface FollowUpItem {
  quotation: string
  customer: string
  product: string
  value: string
  daysOverdue: number
  validTill: string
  owner: string
  region: string
  stage: string
  severity: 'red' | 'amber' | 'green'
  rank?: number
}

export interface ExpiringQuotation {
  quotation: string
  customer: string
  value: string
  validTill: string
}

export interface LostDeal {
  quotation: string
  customer: string
  value: string
  lostReason: string
  stageLost: string
}

export interface LostReasonSummary {
  reason: string
  deals: number
  value: string
  pct: number
}

export interface TopCustomer {
  rank: number
  name: string
  value: string
  orders: number
  barPct: number
  trend: 'up' | 'dn' | 'eq'
  trendVs: string
  ytdValue: string
  lastOrder: string
}

export interface RegionPipeline {
  region: string
  quoted: number
  negotiation: number
  won: number
}

export interface ProductRevenue {
  label: string
  value: string
  pct: number
}

export interface DeliveryRisk {
  woNo: string
  customer: string
  product: string
  committedDate: string
  currentStage: string
  severity: 'critical' | 'at-risk' | 'watch'
}

export interface RevenueTrend {
  month: string
  value: number
}

export interface DecisionBand {
  day: number
  daysInMonth: number
  targetCr: number
  achievedCr: number
  gapCr: number
  coverageX: number
  weightedCr: number
  verdict: 'ok' | 'warn' | 'bad'
  verdictLabel: string
  headline: string
  subtext: string
}

export interface QuotationDetail {
  quotation: string
  customer: string
  product: string
  value: string
  status: string
  region: string
  quotedDate: string
  validTill: string
  daysOverdue: number
  severity: 'red' | 'amber'
  owner: string
  contact: string | null
  timeline: { date: string; event: string }[]
  suggestedNextAction: string
  deepLink: string
}

export interface FollowUpSummary {
  quotation: string
  communication: string
  recipient: string
  emailed: boolean
}

export interface SalesActionResult {
  ok: boolean
  widget: string
  summary?: FollowUpSummary
  deepLink?: string
  meta?: { note: string }
  error?: { code: string; message: string }
}

export interface SalesHomepageData {
  syncedAt:   string
  erpBaseUrl: string
  decisionBand: DecisionBand
  attention: AttentionItem[]
  kpis: KPI[]
  kpisAll: { month: KPI[]; q: KPI[]; ytd: KPI[] }
  funnel: { month: FunnelStage[]; q: FunnelStage[]; ytd: FunnelStage[] }
  revenueTarget: { pct: number; achieved: number; target: number; daysRemaining: number; trend: RevenueTrend[] }
  followUps: FollowUpItem[]
  followUpsTotal: number
  expiringQuotations: ExpiringQuotation[]
  lostDeals: { summary: LostReasonSummary[]; deals: LostDeal[] }
  topCustomers: TopCustomer[]
  regionPipeline: RegionPipeline[]
  productRevenue: ProductRevenue[]
  deliveryRisk: DeliveryRisk[]
}
