import { apiFetch } from "@/lib/api";
import { Role } from "@/lib/auth";
import { Region } from "./types";

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  mobile: string;
  role: Role;
  isActive: boolean;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  skillTags: string[];
  engineerLevel: string | null;
  erpEmployeeId: string | null;
  regions: { region: Region }[];
  companies: { company: { id: string; name: string } }[];
}

export const ROLE_LABEL: Record<Role, string> = {
  CALL_CENTER: "Call Center",
  ASM: "ASM",
  ENGINEER: "Engineer",
  MANAGER: "Manager",
  ADMIN: "Admin",
  CS_SUPPORT: "CS Support",
  MD: "Managing Director",
  SALES_HEAD_AGGREGATE: "Sales Head — Aggregate",
  SALES_HEAD_IM_BMH: "Sales Head — IM/BMH",
  ENGINEERING_DESIGN_HEAD: "Engineering & Design Head",
  MANUFACTURING_HEAD: "Manufacturing Head",
  PROCUREMENT_HEAD: "Procurement Head",
  STORES_HEAD: "Stores Head",
  QMS_HEAD: "QMS Head",
  DISPATCH_HEAD: "Dispatch Head",
  SERVICE_AFTERSALES_HEAD: "Service & After-Sales Head",
  FINANCE_HEAD: "Finance Head",
};

// Admin cannot create/edit Admin accounts through this screen (client
// decision, 2026-07-28) — Admin is deliberately excluded here.
export const CREATABLE_ROLES: Role[] = (Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== "ADMIN");

export const listUsers = (params?: { role?: Role; isActive?: boolean }) => {
  const qs = new URLSearchParams();
  if (params?.role) qs.set("role", params.role);
  if (params?.isActive !== undefined) qs.set("isActive", String(params.isActive));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<ManagedUser[]>(`/users${suffix}`);
};

export interface CreateUserParams {
  fullName: string;
  email: string;
  password: string;
  mobile: string;
  role: Role;
  regions?: Region[];
  skillTags?: string[];
  companyIds?: string[];
  engineerLevel?: string;
  erpEmployeeId?: string;
}

export const createUser = (params: CreateUserParams) =>
  apiFetch<ManagedUser>(`/users`, { method: "POST", body: JSON.stringify(params) });

export interface UpdateUserParams {
  fullName?: string;
  mobile?: string;
  role?: Role;
  regions?: Region[];
  skillTags?: string[];
  companyIds?: string[];
  engineerLevel?: string;
  isActive?: boolean;
}

export const updateUser = (id: string, params: UpdateUserParams) =>
  apiFetch<ManagedUser>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(params) });

export const resetUserPassword = (id: string, newPassword: string) =>
  apiFetch<{ ok: boolean }>(`/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword }) });

export interface CompanyRef {
  id: string;
  name: string;
}

export const listCompanies = () => apiFetch<CompanyRef[]>(`/users/companies`);

export interface UnimportedErpEmployee {
  id: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  status: string;
  erpUserId: string | null;
  cellNumber: string | null;
  department: string | null;
  lastSyncedAt: string;
}

export const listUnimportedErpEmployees = () => apiFetch<UnimportedErpEmployee[]>(`/users/erp-employees/unimported`);
