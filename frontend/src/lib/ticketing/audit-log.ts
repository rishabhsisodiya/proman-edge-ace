import { apiFetch } from "@/lib/api";

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedByUserId: string;
  changedByName: string;
  changedAt: string;
  changeSource: "WEB_UI" | "API" | "SYSTEM_JOB";
  ipAddress: string | null;
}

export interface AuditLogPage {
  data: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogFilters {
  entityType?: string;
  entityId?: string;
  changedByUserId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export function listAuditLog(filters: AuditLogFilters) {
  const params = new URLSearchParams();
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.entityId) params.set("entityId", filters.entityId);
  if (filters.changedByUserId) params.set("changedByUserId", filters.changedByUserId);
  if (filters.search) params.set("search", filters.search);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  params.set("page", String(filters.page ?? 1));
  params.set("pageSize", String(filters.pageSize ?? 50));
  return apiFetch<AuditLogPage>(`/audit-log?${params.toString()}`);
}
