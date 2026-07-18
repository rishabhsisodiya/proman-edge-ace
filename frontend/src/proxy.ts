import { NextRequest, NextResponse } from "next/server";

/**
 * Route guard for /dashboard/*. Named `proxy` (not `middleware`) — Next.js
 * renamed the file convention in this version, see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 */
export function proxy(request: NextRequest) {
  // Renamed from "ace_token" — that cookie no longer exists since the access
  // token is now httpOnly, set directly by the backend as "ace_access_token"
  // (see auth.controller.ts). httpOnly only blocks client-side JS from
  // reading it; server-side middleware like this can still read it fine.
  const token = request.cookies.get("ace_access_token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
