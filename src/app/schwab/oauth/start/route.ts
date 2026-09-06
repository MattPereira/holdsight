import { NextResponse, type NextRequest } from "next/server";

import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import {
  buildSchwabAuthorizationUrl,
  createSchwabOAuthState,
} from "@/lib/brokerage/providers/schwab/oauth";
import { isSchwabConfigured } from "@/lib/brokerage/providers/schwab/config";

const SCHWAB_OAUTH_STATE_COOKIE = "schwab_oauth_state";
const STATE_MAX_AGE_SECONDS = 10 * 60;

function connectRedirect(request: NextRequest, error: string): NextResponse {
  const url = new URL("/connections", request.url);
  url.searchParams.set("schwab", error);
  return NextResponse.redirect(url);
}

// Connecting a brokerage configures the account on screen, so it needs write
// authority over that account, not merely a session: a member who switched to
// the other account gets 403 rather than a Schwab authorization bound to it.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await authorizedViewedAccountId("manageConnections");
  if (!userId) return connectRedirect(request, "auth_required");
  if (!isSchwabConfigured()) return connectRedirect(request, "not_configured");

  const state = createSchwabOAuthState();
  const response = NextResponse.redirect(buildSchwabAuthorizationUrl(state));
  response.cookies.set(SCHWAB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: STATE_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
