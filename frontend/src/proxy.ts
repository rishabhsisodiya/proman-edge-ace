import { NextRequest, NextResponse } from "next/server";

/**
 * Route guard for /dashboard/*. Named `proxy` (not `middleware`) — Next.js
 * renamed the file convention in this version, see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";
const ACCESS_COOKIE = "ace_access_token";
const REFRESH_COOKIE = "ace_refresh_token";

export async function proxy(request: NextRequest) {
  // Renamed from "ace_token" — that cookie no longer exists since the access
  // token is now httpOnly, set directly by the backend as "ace_access_token"
  // (see auth.controller.ts). httpOnly only blocks client-side JS from
  // reading it; server-side middleware like this can still read it fine.
  const token = request.cookies.get(ACCESS_COOKIE)?.value;

  if (token) return NextResponse.next();

  // Access cookie is gone (its 15min maxAge lapsed) but the 7-day refresh
  // cookie may still be valid — call /auth/refresh here before bouncing to
  // login, otherwise every user gets logged out every 15 minutes regardless
  // of session-based apiFetch()'s own silent-refresh logic (which never gets
  // a chance to run because this guard redirects first).
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    try {
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { Cookie: `${REFRESH_COOKIE}=${refreshToken}` },
      });
      if (refreshRes.ok) {
        const setCookie = refreshRes.headers.get("set-cookie");
        const next = NextResponse.next();
        if (setCookie) next.headers.append("set-cookie", setCookie);
        return next;
      }
    } catch {
      // Backend unreachable — fall through to login redirect below.
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
