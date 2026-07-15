import "server-only";

import {
  investmentAccountSections,
  type InvestmentAccountSection,
} from "@/lib/portfolio/account-asset-rows";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";
import type { ManualBalanceItemRow } from "@/lib/manual-balance/items";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import {
  getCurrentPortfolioBalanceSnapshot,
  type CurrentPortfolioBalanceSnapshot,
} from "@/lib/portfolio/balances";

export type PortfolioAccountsData = {
  accounts: DepositoryAccountRow[];
  creditCardAccounts: CreditCardAccountRow[];
  manualItems: ManualBalanceItemRow[];
  investmentAccountSections: InvestmentAccountSection[];
};

export type PortfolioBalancesPageData = {
  portfolioSummary: ReturnType<typeof portfolioAssetSummary>;
  accountData: PortfolioAccountsData;
};

export function emptyPortfolioAccountsData(): PortfolioAccountsData {
  return {
    accounts: [],
    creditCardAccounts: [],
    manualItems: [],
    investmentAccountSections: [],
  };
}

export function emptyPortfolioBalancesPageData(): PortfolioBalancesPageData {
  return {
    portfolioSummary: portfolioAssetSummary([]),
    accountData: emptyPortfolioAccountsData(),
  };
}

function portfolioAccountsDataFromSnapshot(
  snapshot: CurrentPortfolioBalanceSnapshot,
): PortfolioAccountsData {
  return {
    accounts: snapshot.depositoryAccounts,
    creditCardAccounts: snapshot.creditCardAccounts,
    manualItems: snapshot.manualItems,
    investmentAccountSections: investmentAccountSections({
      walletResults: snapshot.walletResults,
      exchangeResults: snapshot.exchangeResults,
      brokerageAccounts: snapshot.brokerageAccounts,
    }),
  };
}

export async function getPortfolioBalancesPageData(
  userId: string,
): Promise<PortfolioBalancesPageData> {
  const snapshot = await getCurrentPortfolioBalanceSnapshot(userId);

  return {
    portfolioSummary: portfolioAssetSummary(snapshot.portfolioResults),
    accountData: portfolioAccountsDataFromSnapshot(snapshot),
  };
}

// The Accounts page renders only the Investments/Banks accordions, so it loads
// the account slice of the snapshot without building the portfolio summary.
export async function getPortfolioAccountsData(
  userId: string,
): Promise<PortfolioAccountsData> {
  const snapshot = await getCurrentPortfolioBalanceSnapshot(userId);

  return portfolioAccountsDataFromSnapshot(snapshot);
}
