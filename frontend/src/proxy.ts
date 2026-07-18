import { NextRequest, NextResponse } from "next/server";

/**
 * Route guard for /dashboard/*. Named `proxy` (not `middleware`) — Next.js
 * renamed the file convention in this version, see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get("ace_token")?.value;

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
