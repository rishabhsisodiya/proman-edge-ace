const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

export function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}`);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Access/refresh tokens are httpOnly cookies now (backend Set-Cookie on
  // login/refresh) — the browser attaches them automatically, no
  // Authorization header to build client-side, and no XSS-readable token.
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401 && !path.startsWith("/auth/")) {
    // Access token expired mid-session — try a silent refresh once, then
    // replay the original request. Falls through to the normal 401 handling
    // below if the refresh itself fails (refresh token also expired/invalid).
    const refreshed = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
    if (refreshed.ok) {
      const retry = await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
      });
      if (!retry.ok) {
        const body = await retry.json().catch(() => null);
        throw new ApiError(retry.status, body);
      }
      if (retry.status === 204) return undefined as T;
      return retry.json() as Promise<T>;
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
