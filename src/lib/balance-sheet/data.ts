import "server-only";

import {
  aggregateAssetRows,
  type AggregateAssetRow,
} from "@/lib/balance-sheet/aggregate-assets";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";
import type { ManualBalanceItemRow } from "@/lib/manual-balance/items";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import {
  getCurrentPortfolioBalanceSnapshot,
  type CurrentPortfolioBalanceSnapshot,
} from "@/lib/portfolio/balances";

export type BalanceSheetData = {
  accounts: DepositoryAccountRow[];
  creditCardAccounts: CreditCardAccountRow[];
  manualItems: ManualBalanceItemRow[];
  aggregateAssetRows: AggregateAssetRow[];
};

export type HomeBalanceData = {
  portfolioSummary: ReturnType<typeof portfolioAssetSummary>;
  balanceSheet: BalanceSheetData;
};

export function emptyBalanceSheetData(): BalanceSheetData {
  return {
    accounts: [],
    creditCardAccounts: [],
    manualItems: [],
    aggregateAssetRows: [],
  };
}

export function emptyHomeBalanceData(): HomeBalanceData {
  return {
    portfolioSummary: portfolioAssetSummary([]),
    balanceSheet: emptyBalanceSheetData(),
  };
}

function balanceSheetDataFromSnapshot(
  snapshot: CurrentPortfolioBalanceSnapshot,
): BalanceSheetData {
  return {
    accounts: snapshot.depositoryAccounts,
    creditCardAccounts: snapshot.creditCardAccounts,
    manualItems: snapshot.manualItems,
    aggregateAssetRows: aggregateAssetRows({
      onChainResults: snapshot.onChainResults,
      exchangeResults: snapshot.exchangeResults,
      brokerageAccounts: snapshot.brokerageAccounts,
    }),
  };
}

export async function getCurrentBalanceSheetData(
  userId: string,
): Promise<BalanceSheetData> {
  const snapshot = await getCurrentPortfolioBalanceSnapshot(userId);
  return balanceSheetDataFromSnapshot(snapshot);
}

export async function getCurrentHomeBalanceData(
  userId: string,
): Promise<HomeBalanceData> {
  const snapshot = await getCurrentPortfolioBalanceSnapshot(userId);

  return {
    portfolioSummary: portfolioAssetSummary(snapshot.portfolioResults),
    balanceSheet: balanceSheetDataFromSnapshot(snapshot),
  };
}
