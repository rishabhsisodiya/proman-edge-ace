export interface KpiTrend {
  dir: 'up' | 'down' | 'neutral'
  delta: string
  label: string
}

export interface PipelineStage {
  label: string; short: string; color: string
  red: number; amber: number; green: number; hold: number
}
export interface DelayedWO {
  wo: string; customer: string; status: string
  daysOver: number; rag: 'red' | 'amber' | 'green'; label: string
}
export interface SubStage {
  label: string; red: number; amber: number; green: number; hold: number
}
export interface MaterialShortage {
  wo: string; item: string; short: string; eta: string; rag: 'red' | 'amber' | 'green'
}
export interface DeptAttendance { dept: string; present: number; total: number }
export interface DowntimeMachine {
  machine: string; hrs: number; reason: string; status: 'open' | 'resolved'
}
export interface CompletingWO {
  wo: string; customer: string; product: string; due: string
  status: string; completion: number; rag: 'red' | 'amber' | 'green'
}
export interface PipelineOrder {
  salesOrder: string; customer: string; product: string
  dueDate: string; woStatus: string
  completedStages: string[]
  activeStages: string[]
}

export interface QualityRejection {
  wo: string; product: string; stage: string
  defect: string; disposition: string; rag: 'red' | 'amber'
}
export interface ManufacturingHomepageData {
  syncedAt:   string
  erpBaseUrl: string
  alert:      string
  kpis: {
    activeWOs:      { value: number; sub: string; trend: KpiTrend | null; red: number; amber: number; green: number; hold: number }
    completedToday: { value: number; sub: string; trend: KpiTrend | null }
    delayedRed:     { value: number; sub: string; trend: KpiTrend | null }
    atRiskAmber:    { value: number; sub: string; trend: KpiTrend | null }
    onHold:         { value: number; sub: string; trend: KpiTrend | null }
  }
  pipelineStages:    PipelineStage[]
  delayedWOs:        DelayedWO[]
  mfgSubStages:      SubStage[]
  materialShortages: MaterialShortage[]
  attendance: {
    present: number; absent: number; onLeave: number; pct: number
    byDept: DeptAttendance[]
  }
  downtime: { totalHrs: number; machines: DowntimeMachine[] }
  completingThisWeek: CompletingWO[]
  qualityRejections: { rejections: number; rework: number; items: QualityRejection[] }
}
