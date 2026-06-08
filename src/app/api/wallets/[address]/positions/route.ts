import { type NextRequest, NextResponse } from "next/server";

import { getWalletPositions } from "@/lib/evm/client";
import { getCurrentUserId } from "@/lib/auth/session";
import type { PositionsResult } from "@/lib/portfolio/types";
import {
  isValidEvmAddress,
  normalizeWalletAddress,
  userHasWalletAddress,
} from "@/lib/evm/wallets";

function statusForResult(result: PositionsResult): number {
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
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { address: rawAddress } = await params;
  const address = normalizeWalletAddress(rawAddress);
  if (!isValidEvmAddress(address)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const isSavedWallet = await userHasWalletAddress(userId, address);
  if (!isSavedWallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;

  try {
    const result = await getWalletPositions(address, {
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
