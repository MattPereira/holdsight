import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";

const AUTH_API_PREFIX = "/api/auth";
const SIGN_IN_PATH = "/";

function isAuthApiRoute(pathname: string): boolean {
  return pathname === AUTH_API_PREFIX || pathname.startsWith(`${AUTH_API_PREFIX}/`);
}

function isApiRoute(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAuthApiRoute(pathname)) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (session) {
    return NextResponse.next();
  }

  if (isApiRoute(pathname)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (pathname === SIGN_IN_PATH) {
    return NextResponse.next();
  }

  const signInUrl = request.nextUrl.clone();
  signInUrl.pathname = SIGN_IN_PATH;
  signInUrl.search = "";

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
