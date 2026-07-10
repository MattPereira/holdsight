import "server-only";

import { portfolioProviderRegistry } from "@/lib/portfolio/providers/registry";
import type { BalancesResult } from "@/lib/portfolio/types";

export { mergeWalletBalanceResults } from "@/lib/wallets/balance-merge";

export async function getCurrentWalletBalances(
  userId: string,
): Promise<BalancesResult[]> {
  return portfolioProviderRegistry.getWalletBalances(userId);
}
