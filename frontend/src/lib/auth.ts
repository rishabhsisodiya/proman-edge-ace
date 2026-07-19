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

/**
 * Changes the current user's password. Backend bumps tokenVersion on success
 * (§8.2 — invalidates every outstanding token, including this session's own),
 * so the caller must send the user back to /login afterwards.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export interface LockableUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  lockedUntil: string | null;
  failedLoginAttempts: number;
}

/** Admin-only — accounts currently locked out from too many failed logins (§8.2). */
export function getLockedUsers(): Promise<LockableUser[]> {
  return apiFetch<LockableUser[]>("/users?lockedOnly=true");
}

/** Admin-only early unlock, before the 30-minute lock expires naturally. */
export function unlockUser(userId: string): Promise<void> {
  return apiFetch(`/auth/users/${userId}/unlock`, { method: "POST" }).then(() => undefined);
}

/** Where each role lands after login — one dashboard per role per §6.1. */
export function dashboardPathForRole(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/dashboard/admin";
    case "MANUFACTURING_HEAD":
      return "/dashboard/manufacturing";
    case "CALL_CENTER":
      return "/dashboard/call-center";
    case "ASM":
      return "/dashboard/asm";
    case "ENGINEER":
      return "/dashboard/my-tickets";
    case "MANAGER":
    case "SERVICE_AFTERSALES_HEAD":
      return "/dashboard/service";
    default:
      return "/dashboard/service"; // other role dashboards (sales, finance, etc.) not built yet
  }
}
