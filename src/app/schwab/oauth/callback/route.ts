import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import { getUserSchwabConnections } from "@/lib/brokerage/connections";
import { syncSchwabConnection } from "@/lib/brokerage/balances";
import {
  exchangeSchwabAuthorizationCode,
  saveSchwabOAuthConnection,
} from "@/lib/brokerage/providers/schwab/oauth";

const SCHWAB_OAUTH_STATE_COOKIE = "schwab_oauth_state";

function connectRedirect(request: NextRequest, result: string): NextResponse {
  const url = new URL("/connections", request.url);
  url.searchParams.set("schwab", result);
  return NextResponse.redirect(url);
}

function clearStateCookie(response: NextResponse): NextResponse {
  response.cookies.delete(SCHWAB_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await authorizedViewedAccountId("manageConnections");
  if (!userId) {
    return clearStateCookie(connectRedirect(request, "auth_required"));
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return clearStateCookie(connectRedirect(request, "oauth_error"));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(SCHWAB_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return clearStateCookie(connectRedirect(request, "invalid_state"));
  }

  try {
    const tokens = await exchangeSchwabAuthorizationCode(code);
    const connectionId = await saveSchwabOAuthConnection({ userId, tokens });
    const connection = (await getUserSchwabConnections(userId)).find(
      (item) => item.id === connectionId,
    );
    if (connection) {
      try {
        await syncSchwabConnection(connection);
      } catch (syncError) {
        console.error("Initial Schwab account sync failed", syncError);
      }
    }
    revalidatePath("/");
    revalidatePath("/connections");
    revalidatePath("/brokerages");
    return clearStateCookie(connectRedirect(request, "connected"));
  } catch (exchangeError) {
    console.error("Schwab OAuth callback failed", exchangeError);
    return clearStateCookie(connectRedirect(request, "token_exchange_failed"));
  }
}
