import { apiFetch, deleteCookie, getCookie, setCookie } from "./api";

export type Role =
  // ACE ticketing roles
  | "CALL_CENTER"
  | "ASM"
  | "ENGINEER"
  | "MANAGER"
  | "ADMIN"
  // Proman Edge dashboard roles
  | "MD"
  | "SALES_HEAD_AGGREGATE"
  | "SALES_HEAD_IM_BMH"
  | "ENGINEERING_DESIGN_HEAD"
  | "MANUFACTURING_HEAD"
  | "PROCUREMENT_HEAD"
  | "STORES_HEAD"
  | "QMS_HEAD"
  | "DISPATCH_HEAD"
  | "SERVICE_AFTERSALES_HEAD"
  | "FINANCE_HEAD";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
}

interface LoginResponse {
  user: AuthUser;
  mustChangePassword: boolean;
}

// Access/refresh tokens are httpOnly cookies set directly by the backend
// (Set-Cookie on /auth/login) — frontend never sees or stores them. This
// cookie is just UI-convenience data (who's logged in, for display/routing),
// not a credential, so it's fine as a plain readable cookie.
const USER_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days, matches refresh token lifetime

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  setCookie("ace_user", JSON.stringify(res.user), USER_COOKIE_MAX_AGE);

  return res;
}

export async function logout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    deleteCookie("ace_user");
    window.location.href = "/login";
  }
}

export function getCurrentUser(): AuthUser | null {
  const raw = getCookie("ace_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/** Where each role lands after login. Admin lands on Service by default (has access to all). */
export function dashboardPathForRole(role: Role): string {
  switch (role) {
    case "MANUFACTURING_HEAD":
      return "/dashboard/manufacturing";
    case "CALL_CENTER":
    case "ASM":
    case "ENGINEER":
    case "MANAGER":
    case "ADMIN":
    case "SERVICE_AFTERSALES_HEAD":
      return "/dashboard/service";
    default:
      return "/dashboard/service"; // other role dashboards (sales, finance, etc.) not built yet
  }
}
