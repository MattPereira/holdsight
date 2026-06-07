"use server";

import { validateConfiguredWallets, wallets } from "@/lib/wallets";
import { getWalletPositions } from "@/lib/positions";
import type { PositionsResult } from "@/lib/types";

/**
 * Fetch positions for every tracked wallet. Called from the client only on a
 * button click, so this is the single place a Zerion request is triggered.
 *
 * Wallets are fetched sequentially (not in parallel) so we never burst past the
 * per-second rate limit. If we get rate limited, we stop immediately rather than
 * spending more of the limited daily quota on calls that would also fail.
 */
export async function loadPositions(): Promise<PositionsResult[]> {
  const walletConfigError = validateConfiguredWallets();
  if (walletConfigError) {
    return [
      {
        status: "error",
        address: "WALLETS",
        message: walletConfigError,
        httpStatus: 500,
      },
    ];
  }

  const results: PositionsResult[] = [];
  for (const address of wallets) {
    const result = await getWalletPositions(address);
    results.push(result);
    if (result.status === "rate_limited") break;
  }
  return results;
}
