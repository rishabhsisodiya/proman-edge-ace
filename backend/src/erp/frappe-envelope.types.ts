// Ported from PROMAN/backend/src/types/frappe.ts — only what's needed by the
// quotation-actions drawer (Sales dashboard). Extend as more RPC-based
// dashboard features are ported.

export interface FrappeEnvelope<TSummary = Record<string, unknown>, TItem = unknown> {
  ok: boolean;
  widget: string;
  as_of: string;
  period: unknown | null;
  filters_applied: Record<string, unknown>;
  summary: TSummary;
  items: TItem[];
  total_count: number;
  deep_link: string | null;
  alert: unknown | null;
  meta: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface FrappeQuotationDetail {
  quotation_id: string;
  customer_name: string;
  product: string;
  value: number;
  status: string;
  territory: string;
  quoted_date: string;
  valid_till: string;
  days_since_followup: number;
  level: 'red' | 'amber';
  owner: string;
  owner_name: string;
  contact: string | null;
  timeline: { date: string; event: string }[];
  suggested_next_action: string;
  deep_link?: string;
}
