import { type NextRequest, NextResponse } from "next/server";

import { getWalletBalances } from "@/lib/evm/client";
import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import type { BalancesResult } from "@/lib/portfolio/types";
import {
  isValidEvmAddress,
  normalizeEvmAddress,
  userHasEvmAccountAddress,
} from "@/lib/evm/accounts";

function statusForResult(result: BalancesResult): number {
  switch (result.status) {
    case "ready":
      return 200;
    case "indexing":
      return 202;
    case "rate_limited":
      return 429;
    case "error":
      return result.httpStatus;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  // Privacy-first: no portfolio data leaves the server without a valid session.
  const userId = await authorizedViewedAccountId("read");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { address: rawAddress } = await params;
  const address = normalizeEvmAddress(rawAddress);
  if (!isValidEvmAddress(address)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const isSavedWallet = await userHasEvmAccountAddress(userId, address);
  if (!isSavedWallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;

  try {
    const result = await getWalletBalances(address, {
      currency: searchParams.get("currency") ?? undefined,
      // Pass ?chains=ethereum,base to narrow; omit for all chains.
      chains: searchParams.get("chains") ?? undefined,
    });

    return NextResponse.json(result, { status: statusForResult(result) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { status: "error", error: message },
      { status: 502 },
    );
  }
}
