import * as path from 'path';
import * as XLSX from 'xlsx';
import type {
  EntityAmount,
  EntityAmountWithTrend,
  CashBankAccount,
  AgeingBucket,
  TopDebtor,
  GrossMarginEntity,
  PayablesInvoiceRow,
  UnpaidInvoice,
  JournalEntryPending,
  PoApprovalItem,
  FinanceHomepageData,
  Period,
  PeriodStat,
} from './finance.types';
// Ported verbatim from PROMAN/backend/src/services/financeSiteSheetService.ts
// Reads Finance Head data for sites we don't have DB access to (Tally-based).
// Client fills the workbook in backend/data/site-sheets/<Site>.xlsx.
// NOTE: these xlsx files are client-provided data we don't have — functions
// return empty results until the files exist, by design (readTab's catch).

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function periodRange(period: Period, asOf: Date = new Date()): { start: string; end: string } {
  const end = iso(asOf);
  const y = asOf.getFullYear();
  const m = asOf.getMonth();
  if (period === 'M') return { start: iso(new Date(y, m, 1)), end };
  const fy = m >= 3 ? y : y - 1;
  if (period === 'Q') {
    const q = m >= 3 ? Math.floor((m - 3) / 3) + 1 : 4;
    const qStartMonth = q === 4 ? 0 : 3 + (q - 1) * 3;
    const qStartYear = q === 4 ? fy + 1 : fy;
    return { start: iso(new Date(qStartYear, qStartMonth, 1)), end };
  }
  return { start: iso(new Date(fy, 3, 1)), end };
}

// Resolved from process.cwd() (always the backend/ project root when the app
// is started via `npm run dev` / `node dist/src/main.js`), not __dirname —
// nest build emits to dist/src/... (an extra nesting level vs dist/...), which
// silently broke a __dirname-relative path here (readTab's try/catch made the
// failure invisible: it just looked like "no data" instead of an error).
const SITE_SHEET_DIR = path.join(process.cwd(), 'data', 'site-sheets');

const SITE_FILES: Record<string, string> = {
  ACE: 'ACE.xlsx',
  PROMAX: 'PROMAX.xlsx',
  'QMS Pro': 'QMSPro.xlsx',
  Dynatek: 'Dynatek.xlsx',
};

export function getSiteSheetCompanies(): string[] {
  return Object.keys(SITE_FILES);
}

function readTab(company: string, tab: string): Record<string, unknown>[] {
  const file = SITE_FILES[company];
  if (!file) return [];
  try {
    const wb = XLSX.readFile(path.join(SITE_SHEET_DIR, file));
    const ws = wb.Sheets[tab];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { defval: null });
  } catch {
    return [];
  }
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v) || 0;
}
function str(v: unknown): string {
  return v == null ? '' : String(v);
}
function gmPct(income: number, expense: number): number | null {
  return income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : null;
}
function isReturn(v: unknown): boolean {
  return str(v).trim().toUpperCase() === 'Y';
}

export function getSiteSheetCashBank(): { byEntity: EntityAmountWithTrend[]; accountsByEntity: Record<string, CashBankAccount[]>; total: number } {
  const byEntity: EntityAmountWithTrend[] = [];
  const accountsByEntity: Record<string, CashBankAccount[]> = {};
  let total = 0;
  for (const entity of getSiteSheetCompanies()) {
    const rows = readTab(entity, 'Cash & Bank Balances');
    const accounts: CashBankAccount[] = rows.map((r) => ({ account: str(r.account_name), accountType: '', balance: num(r.balance) }));
    const value = accounts.reduce((s, a) => s + a.balance, 0);
    accountsByEntity[entity] = accounts;
    byEntity.push({ entity, value, changeVs7d: 0 });
    total += value;
  }
  return { byEntity, accountsByEntity, total };
}

export function getSiteSheetRevenueByEntity(start: string, end: string): EntityAmount[] {
  return getSiteSheetCompanies().map((entity) => {
    const rows = readTab(entity, 'Sales Invoices');
    const value = rows
      .filter((r) => !isReturn(r.is_return) && str(r.posting_date) >= start && str(r.posting_date) <= end)
      .reduce((s, r) => s + num(r.grand_total), 0);
    return { entity, value };
  });
}

export function getSiteSheetOverdueReceivables(): { total: number; over90: number; over90Count: number; byEntity: (EntityAmount & { over90: number })[] } {
  const today = new Date();
  let total = 0,
    over90 = 0,
    over90Count = 0;
  const byEntity = getSiteSheetCompanies().map((entity) => {
    const rows = readTab(entity, 'Sales Invoices').filter((r) => !isReturn(r.is_return) && num(r.outstanding_amount) > 0);
    let entityTotal = 0,
      entityOver90 = 0;
    for (const r of rows) {
      const dueDate = new Date(str(r.due_date));
      if (dueDate >= today) continue;
      const outstanding = num(r.outstanding_amount);
      entityTotal += outstanding;
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
      if (daysOverdue > 90) {
        entityOver90 += outstanding;
        over90Count++;
      }
    }
    total += entityTotal;
    over90 += entityOver90;
    return { entity, value: entityTotal, over90: entityOver90 };
  });
  return { total, over90, over90Count, byEntity };
}

export function getSiteSheetGstByEntity(start: string, end: string): EntityAmount[] {
  return getSiteSheetCompanies().map((entity) => {
    const rows = readTab(entity, 'GL Summary').filter((r) => str(r.account_type) === 'GST Payable' && str(r.posting_date) >= start && str(r.posting_date) <= end);
    return { entity, value: rows.reduce((s, r) => s + num(r.credit) - num(r.debit), 0) };
  });
}

function bucketFor(daysOverdue: number): '0-30' | '31-60' | '61-90' | '90+' {
  if (daysOverdue <= 30) return '0-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

export function getSiteSheetReceivablesAgeing(): { byEntity: Record<string, AgeingBucket[]>; topDebtors: TopDebtor[] } {
  const byEntity: Record<string, AgeingBucket[]> = {};
  const topDebtors: TopDebtor[] = [];
  const today = new Date();
  for (const entity of getSiteSheetCompanies()) {
    const rows = readTab(entity, 'Sales Invoices').filter((r) => !isReturn(r.is_return) && num(r.outstanding_amount) > 0);
    const totals: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const byCustomer = new Map<string, TopDebtor>();
    for (const r of rows) {
      const dueDate = new Date(str(r.due_date));
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
      const bucket = bucketFor(daysOverdue);
      const amount = num(r.outstanding_amount);
      totals[bucket] += amount;
      const customer = str(r.customer);
      if (!byCustomer.has(customer)) byCustomer.set(customer, { customer, netReceivable: 0, entity, buckets: [] });
      const d = byCustomer.get(customer)!;
      d.netReceivable += amount;
      const existing = d.buckets.find((b) => b.bucket === bucket);
      if (existing) existing.amount += amount;
      else d.buckets.push({ bucket, amount });
    }
    byEntity[entity] = (Object.keys(totals) as AgeingBucket['bucket'][]).map((bucket) => ({ bucket, amount: Math.round(totals[bucket] * 100) / 100 }));
    topDebtors.push(...byCustomer.values());
  }
  return { byEntity, topDebtors: topDebtors.sort((a, b) => b.netReceivable - a.netReceivable) };
}

export function getSiteSheetPayablesDue7d(): { byEntity: EntityAmount[]; total: number; vendors: number } {
  const byEntity: EntityAmount[] = [];
  const vendorSet = new Set<string>();
  let total = 0;
  const today = new Date();
  const in7d = new Date(today.getTime() + 7 * 86_400_000);
  for (const entity of getSiteSheetCompanies()) {
    const rows = readTab(entity, 'Purchase Invoices').filter((r) => {
      if (num(r.outstanding_amount) <= 0) return false;
      const due = new Date(str(r.due_date));
      return due >= today && due <= in7d;
    });
    const value = rows.reduce((s, r) => s + num(r.outstanding_amount), 0);
    rows.forEach((r) => vendorSet.add(str(r.supplier)));
    byEntity.push({ entity, value });
    total += value;
  }
  return { byEntity, total, vendors: vendorSet.size };
}

export function getSiteSheetPayablesInvoices14d(): PayablesInvoiceRow[] {
  const rows: PayablesInvoiceRow[] = [];
  const today = new Date();
  const in14d = new Date(today.getTime() + 14 * 86_400_000);
  for (const entity of getSiteSheetCompanies()) {
    readTab(entity, 'Purchase Invoices').forEach((r) => {
      if (num(r.outstanding_amount) <= 0) return;
      const due = new Date(str(r.due_date));
      if (due >= today && due <= in14d) {
        rows.push({ dueDate: str(r.due_date), supplier: str(r.supplier), amount: num(r.outstanding_amount), entity });
      }
    });
  }
  return rows;
}

export function getSiteSheetActionQueue(): { paymentsToRelease: UnpaidInvoice[]; journalEntriesPending: JournalEntryPending[] } {
  const paymentsToRelease: UnpaidInvoice[] = [];
  const journalEntriesPending: JournalEntryPending[] = [];
  const today = new Date();
  for (const entity of getSiteSheetCompanies()) {
    readTab(entity, 'Purchase Invoices').forEach((r) => {
      const outstanding = num(r.outstanding_amount);
      const grandTotal = num(r.grand_total);
      if (outstanding > 0 && Math.round(outstanding) >= Math.round(grandTotal)) {
        const dueDate = new Date(str(r.due_date));
        paymentsToRelease.push({
          invoiceNo: str(r.invoice_no),
          vendor: str(r.supplier),
          amount: outstanding,
          dueDate: str(r.due_date),
          daysOverdue: Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000),
          entity,
        });
      }
    });
    readTab(entity, 'Journal Entries').forEach((r) => {
      if (str(r.status) !== 'Draft') return;
      const posting = new Date(str(r.posting_date));
      journalEntriesPending.push({
        name: str(r.je_no),
        userRemark: '',
        totalDebit: num(r.total_debit),
        voucherType: str(r.voucher_type),
        daysPending: Math.floor((today.getTime() - posting.getTime()) / 86_400_000),
        entity,
      });
    });
  }
  return { paymentsToRelease, journalEntriesPending };
}

export function getSiteSheetPoApprovalQueue(): PoApprovalItem[] {
  const items: PoApprovalItem[] = [];
  const today = new Date();
  for (const entity of getSiteSheetCompanies()) {
    readTab(entity, 'Purchase Orders')
      .filter((r) => str(r.workflow_state) === 'Awaiting AM Approval')
      .forEach((r) => {
        const poDate = new Date(str(r.po_date));
        items.push({
          poNo: str(r.po_no),
          vendor: str(r.supplier),
          value: num(r.grand_total),
          approvalStage: str(r.workflow_state),
          poDate: str(r.po_date),
          daysPending: Math.floor((today.getTime() - poDate.getTime()) / 86_400_000),
          entity,
        });
      });
  }
  return items;
}

export function getSiteSheetGrossMarginByEntity(start: string, end: string, gmTargetPctFor: (entity: string) => number): GrossMarginEntity[] {
  return getSiteSheetCompanies().map((entity) => {
    const rows = readTab(entity, 'GL Summary').filter((r) => str(r.posting_date) >= start && str(r.posting_date) <= end);
    const income = rows.filter((r) => str(r.account_type) === 'Direct Income').reduce((s, r) => s + num(r.credit), 0);
    const expense = rows.filter((r) => str(r.account_type) === 'Direct Expense').reduce((s, r) => s + num(r.debit), 0);
    return { entity, income, expense, gmPct: gmPct(income, expense), targetPct: gmTargetPctFor(entity) };
  });
}

const STATUTORY_TYPES: { type: string; label: string; dueDay: number }[] = [
  { type: 'GST Payable', label: 'GST', dueDay: 20 },
  { type: 'TDS Payable', label: 'TDS', dueDay: 7 },
  { type: 'PF', label: 'PF', dueDay: 14 },
];

function daysUntilNextDue(dueDay: number, now: Date = new Date()): number {
  const candidate = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (candidate < now) candidate.setMonth(candidate.getMonth() + 1);
  return Math.ceil((candidate.getTime() - now.getTime()) / 86_400_000);
}

export function getSiteSheetStatutoryDuesSoon(): { label: string; amount: number; daysUntil: number }[] {
  const results: { label: string; amount: number; daysUntil: number }[] = [];
  for (const { type, label, dueDay } of STATUTORY_TYPES) {
    const daysUntil = daysUntilNextDue(dueDay);
    if (daysUntil > 2) continue;
    let amount = 0;
    for (const entity of getSiteSheetCompanies()) {
      readTab(entity, 'GL Summary')
        .filter((r) => str(r.account_type) === type)
        .forEach((r) => {
          amount += num(r.credit) - num(r.debit);
        });
    }
    if (amount > 0) results.push({ label, amount, daysUntil });
  }
  return results;
}

function mergePeriodStat(base: PeriodStat, period: Period): PeriodStat {
  const { start, end } = periodRange(period);
  const extra = getSiteSheetRevenueByEntity(start, end);
  return { ...base, total: base.total + extra.reduce((s, e) => s + e.value, 0), byEntity: [...base.byEntity, ...extra] };
}

export function mergeSiteSheetsIntoHomepage(base: FinanceHomepageData, gmTargetPctFor: (entity: string) => number): FinanceHomepageData {
  const sheetCashBank = getSiteSheetCashBank();
  const cashBank = {
    ...base.cashBank,
    total: base.cashBank.total + sheetCashBank.total,
    byEntity: [...base.cashBank.byEntity, ...sheetCashBank.byEntity],
    accountsByEntity: { ...base.cashBank.accountsByEntity, ...sheetCashBank.accountsByEntity },
  };

  const sheetOverdue = getSiteSheetOverdueReceivables();
  const overdueReceivables = {
    ...base.overdueReceivables,
    total: base.overdueReceivables.total + sheetOverdue.total,
    over90: base.overdueReceivables.over90 + sheetOverdue.over90,
    over90Count: base.overdueReceivables.over90Count + sheetOverdue.over90Count,
    byEntity: [...base.overdueReceivables.byEntity, ...sheetOverdue.byEntity],
  };

  function mergeGstPeriodStat(stat: PeriodStat, period: Period): PeriodStat {
    const { start, end } = periodRange(period);
    const perEntity = getSiteSheetGstByEntity(start, end);
    return { ...stat, total: stat.total + perEntity.reduce((s, e) => s + e.value, 0), byEntity: [...stat.byEntity, ...perEntity] };
  }
  const gstLiability = {
    ...base.gstLiability,
    M: mergeGstPeriodStat(base.gstLiability.M, 'M'),
    Q: mergeGstPeriodStat(base.gstLiability.Q, 'Q'),
    Y: mergeGstPeriodStat(base.gstLiability.Y, 'Y'),
  };

  const revenue = {
    ...base.revenue,
    M: mergePeriodStat(base.revenue.M, 'M'),
    Q: mergePeriodStat(base.revenue.Q, 'Q'),
    Y: mergePeriodStat(base.revenue.Y, 'Y'),
  };

  const sheetAgeing = getSiteSheetReceivablesAgeing();
  const receivablesAgeing = {
    ...base.receivablesAgeing,
    byEntity: { ...base.receivablesAgeing.byEntity, ...sheetAgeing.byEntity },
    topDebtors: [...base.receivablesAgeing.topDebtors, ...sheetAgeing.topDebtors].sort((a, b) => b.netReceivable - a.netReceivable),
  };

  const sheetPayables = getSiteSheetPayablesDue7d();
  const payablesDue7d = {
    ...base.payablesDue7d,
    total: base.payablesDue7d.total + sheetPayables.total,
    vendors: base.payablesDue7d.vendors + sheetPayables.vendors,
    byEntity: [...base.payablesDue7d.byEntity, ...sheetPayables.byEntity],
  };
  const payablesInvoices14d = [...base.payablesInvoices14d, ...getSiteSheetPayablesInvoices14d()];

  const sheetActionQueue = getSiteSheetActionQueue();
  const actionQueue = {
    paymentsToRelease: [...base.actionQueue.paymentsToRelease, ...sheetActionQueue.paymentsToRelease],
    paymentsToReleaseTotal: base.actionQueue.paymentsToReleaseTotal + sheetActionQueue.paymentsToRelease.length,
    journalEntriesPending: [...base.actionQueue.journalEntriesPending, ...sheetActionQueue.journalEntriesPending],
  };

  const poApprovalQueue = [...base.poApprovalQueue, ...getSiteSheetPoApprovalQueue()];

  function mergeGrossMarginStat(stat: FinanceHomepageData['grossMargin']['M'], period: Period) {
    const { start, end } = periodRange(period);
    const sheetByEntity = getSiteSheetGrossMarginByEntity(start, end, gmTargetPctFor);
    const byEntity = [...stat.byEntity, ...sheetByEntity];
    const income = byEntity.reduce((s, e) => s + e.income, 0);
    const expense = byEntity.reduce((s, e) => s + e.expense, 0);
    const weightedTarget =
      income > 0 ? byEntity.reduce((s, e) => s + e.targetPct * e.income, 0) / income : byEntity.reduce((s, e) => s + e.targetPct, 0) / (byEntity.length || 1);
    return {
      income,
      expense,
      grossMargin: income - expense,
      gmPct: gmPct(income, expense),
      targetPct: Math.round(weightedTarget * 10) / 10,
      byEntity,
      periodLabel: stat.periodLabel,
    };
  }
  const grossMargin = {
    M: mergeGrossMarginStat(base.grossMargin.M, 'M'),
    Q: mergeGrossMarginStat(base.grossMargin.Q, 'Q'),
    Y: mergeGrossMarginStat(base.grossMargin.Y, 'Y'),
  };

  const sheetLowCash = cashBank.byEntity.filter((e) => getSiteSheetCompanies().includes(e.entity) && e.value < 5_000_000);
  const alerts = [...base.alerts];
  if (sheetLowCash.length > 0) {
    alerts.push({
      level: 'amber',
      title: `Cash balance below ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(5_000_000)}`,
      subtitle: sheetLowCash.length === 1 ? '' : sheetLowCash.map((e) => e.entity).join(', '),
      entityLabel: sheetLowCash.length === 1 ? sheetLowCash[0].entity : `${sheetLowCash.length} entities`,
    });
  }
  const sheetStatutory = getSiteSheetStatutoryDuesSoon();
  if (sheetStatutory.length > 0) {
    alerts.push({
      level: 'red',
      title: sheetStatutory.map((d) => `${d.label} ₹${(d.amount / 100000).toFixed(1)}L due in ${d.daysUntil}d (site sheets)`).join(', '),
      subtitle: 'Statutory payment not yet released.',
      entityLabel: 'Group',
    });
  }

  return {
    ...base,
    entities: [...base.entities, ...getSiteSheetCompanies()],
    cashBank,
    revenue,
    overdueReceivables,
    receivablesAgeing,
    gstLiability,
    payablesDue7d,
    payablesInvoices14d,
    actionQueue,
    poApprovalQueue,
    grossMargin,
    alerts,
  };
}
