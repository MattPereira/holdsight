import "server-only";

import { syncUserDepositoryBalances } from "@/lib/depository/balances";
import { syncUserCreditCardAccounts } from "@/lib/credit-card/balances";
import { portfolioProviderRegistry } from "@/lib/portfolio/providers/registry";
import {
  getPortfolioBalancesPageData,
  type PortfolioBalancesPageData,
} from "@/lib/portfolio/page-data";

export async function refreshPortfolioForUser(
  userId: string,
): Promise<PortfolioBalancesPageData> {
  // The wallet/kraken/brokerage providers and portfolio-path revalidation are
  // owned by the registry's refreshAll. Depository and credit-card balances stay
  // outside the registry (balance-only, no sync phase), so they're refreshed
  // alongside it here.
  await Promise.all([
    portfolioProviderRegistry.refreshAll(userId),
    syncUserDepositoryBalances(userId),
    syncUserCreditCardAccounts(userId),
  ]);

  return getPortfolioBalancesPageData(userId);
}
