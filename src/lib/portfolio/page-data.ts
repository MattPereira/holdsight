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

export type PortfolioHomeData = {
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

export function emptyPortfolioHomeData(): PortfolioHomeData {
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

export async function getCurrentPortfolioHomeData(
  userId: string,
): Promise<PortfolioHomeData> {
  const snapshot = await getCurrentPortfolioBalanceSnapshot(userId);

  return {
    portfolioSummary: portfolioAssetSummary(snapshot.portfolioResults),
    accountData: portfolioAccountsDataFromSnapshot(snapshot),
  };
}
