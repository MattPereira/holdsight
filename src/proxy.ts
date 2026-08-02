import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";

const AUTH_API_PREFIX = "/api/auth";
const BLOB_CLEANUP_CRON_PATH = "/api/cron/blob-cleanup";
const MCP_API_PATH = "/api/mcp";
const MCP_AUTHORIZATION_SERVER_METADATA_PATH =
  "/.well-known/oauth-authorization-server";
const MCP_PROTECTED_RESOURCE_METADATA_PREFIX =
  "/.well-known/oauth-protected-resource";
const AUTH_ERROR_PATH = "/auth/error";
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

  if (pathname === AUTH_ERROR_PATH) {
    return NextResponse.next();
  }

  if (pathname === BLOB_CLEANUP_CRON_PATH) {
    return NextResponse.next();
  }

  if (
    pathname === MCP_API_PATH ||
    pathname === MCP_AUTHORIZATION_SERVER_METADATA_PATH ||
    pathname.startsWith(MCP_PROTECTED_RESOURCE_METADATA_PREFIX)
  ) {
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
    "/((?!_next/static|_next/image|favicon.ico|\\.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
