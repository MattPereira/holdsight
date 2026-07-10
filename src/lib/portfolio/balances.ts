import "server-only";

import { cache } from "react";

import {
  getCurrentBrokerageBalances,
  type CurrentBrokerageAccount,
} from "@/lib/brokerage/balances";
import {
  getUserDepositoryAccounts,
  type DepositoryAccountRow,
} from "@/lib/depository/accounts";
import {
  getUserCreditCardAccounts,
  type CreditCardAccountRow,
} from "@/lib/credit-card/accounts";
import {
  getUserManualBalanceItems,
  type ManualBalanceItemRow,
} from "@/lib/manual-balance/items";
import { krakenAdapter } from "@/lib/portfolio/providers/kraken-adapter";
import { portfolioProviderRegistry } from "@/lib/portfolio/providers/registry";
import type { BalancesResult } from "@/lib/portfolio/types";

export type CurrentPortfolioBalanceSnapshot = {
  portfolioResults: BalancesResult[];
  walletResults: BalancesResult[];
  exchangeResults: BalancesResult[];
  brokerageAccounts: CurrentBrokerageAccount[];
  depositoryAccounts: DepositoryAccountRow[];
  creditCardAccounts: CreditCardAccountRow[];
  manualItems: ManualBalanceItemRow[];
};

function depositoryAccountsToBalancesResult(
  accounts: DepositoryAccountRow[],
  creditCardAccounts: CreditCardAccountRow[],
  manualItems: ManualBalanceItemRow[],
): BalancesResult | null {
  const checkingAccounts = accounts.filter(
    (account) => account.kind === "checking" && account.currency === "USD",
  );
  const checkingTotal = checkingAccounts.reduce(
    (sum, account) => sum + account.currentBalance,
    0,
  );
  const liabilityTotal =
    creditCardAccounts.reduce(
      (sum, account) => sum + account.currentBalance,
      0,
    ) +
    manualItems.reduce(
      (sum, item) => sum + (item.kind === "liability" ? item.amount : 0),
      0,
    );
  const netCash = checkingTotal - liabilityTotal;

  if (netCash === 0) return null;

  return {
    status: "ready",
    address: "Depository",
    balances: [
      {
        sourceBalanceId: "net-cash-usd",
        aggregationKey: `depository-checking:${checkingAccounts
          .map((account) => account.id)
          .sort()
          .join(":")}:net-liabilities`,
        symbol: "USD",
        name: "Checking Net ",
        chainId: "depository",
        amount: netCash,
        priceUsd: 1,
        valueUsd: netCash,
      },
    ],
  };
}

function manualAssetsToBalancesResult(
  items: ManualBalanceItemRow[],
): BalancesResult | null {
  const manualAssets = items.filter((item) => item.kind === "asset");
  if (manualAssets.length === 0) return null;

  return {
    status: "ready",
    address: "Manual Assets",
    balances: manualAssets.map((item) => ({
      sourceBalanceId: `manual-asset:${item.id}`,
      aggregationKey: `manual-asset:${item.id}`,
      symbol: item.symbol,
      name: item.name,
      chainId: "manual",
      amount: item.amount,
      priceUsd: 1,
      valueUsd: item.amount,
    })),
  };
}

export const getCurrentPortfolioBalanceSnapshot = cache(
  async (userId: string): Promise<CurrentPortfolioBalanceSnapshot> => {
    // The registry has no kraken-only or raw-brokerage-account accessor (only
    // getWalletBalances, since wallet is the one grouping that needs a scoped
    // view). exchangeResults/brokerageAccounts read the kraken adapter and the
    // brokerage module directly; both underlying reads are cache()-wrapped so
    // this doesn't duplicate the fetch registry.getPortfolioBalances also does.
    const [
      portfolioProviderResults,
      walletResults,
      exchangeResults,
      brokerageAccounts,
      depositoryAccounts,
      creditCardAccounts,
      manualItems,
    ] = await Promise.all([
      portfolioProviderRegistry.getPortfolioBalances(userId),
      portfolioProviderRegistry.getWalletBalances(userId),
      krakenAdapter.getBalances(userId),
      getCurrentBrokerageBalances(userId),
      getUserDepositoryAccounts(userId),
      getUserCreditCardAccounts(userId),
      getUserManualBalanceItems(userId),
    ]);

    const depositoryResult = depositoryAccountsToBalancesResult(
      depositoryAccounts,
      creditCardAccounts,
      manualItems,
    );
    const manualAssetsResult = manualAssetsToBalancesResult(manualItems);

    return {
      portfolioResults: [
        ...portfolioProviderResults,
        ...(depositoryResult ? [depositoryResult] : []),
        ...(manualAssetsResult ? [manualAssetsResult] : []),
      ],
      walletResults,
      exchangeResults,
      brokerageAccounts,
      depositoryAccounts,
      creditCardAccounts,
      manualItems,
    };
  },
);

export async function getCurrentPortfolioBalances(
  userId: string,
): Promise<BalancesResult[]> {
  return (await getCurrentPortfolioBalanceSnapshot(userId)).portfolioResults;
}
