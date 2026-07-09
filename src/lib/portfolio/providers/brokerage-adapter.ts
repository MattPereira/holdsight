import "server-only";

import {
  getCurrentBrokerageBalances,
  syncUserBrokerageBalances,
  type CurrentBrokerageAccount,
} from "@/lib/brokerage/balances";
import {
  getBrokerageTransactionImportStatus,
  getCurrentBrokerageTransactions,
} from "@/lib/brokerage/transactions";
import type { BalancesResult } from "@/lib/portfolio/types";

import type {
  PortfolioProviderAccount,
  PortfolioProviderAdapter,
  ProviderTransactionStatus,
} from "./types";

function brokerageCashName(account: CurrentBrokerageAccount): string {
  const institutionName = account.institutionName?.trim();
  const accountLabel = account.label?.trim();

  return `${institutionName} ${accountLabel}`;
}

function brokerageAccountToBalancesResult(
  account: CurrentBrokerageAccount,
): BalancesResult {
  return {
    status: "ready",
    address: account.label ?? account.institutionName ?? account.brokerage,
    balances: account.balances.map((balance) => {
      const isCash = balance.assetClass === "cash";
      return {
        sourceBalanceId: balance.sourceBalanceId,
        aggregationKey: isCash
          ? `brokerage-cash:${account.id}:${balance.symbol.toUpperCase()}`
          : undefined,
        symbol: balance.symbol,
        name: isCash ? brokerageCashName(account) : balance.name,
        chainId: "brokerage",
        amount: balance.amount,
        priceUsd: balance.priceUsd,
        valueUsd: balance.valueUsd,
      };
    }),
  };
}

/** Thin facade over the existing brokerage module. Its depth is candidate 1. */
export const brokerageAdapter: PortfolioProviderAdapter = {
  id: "brokerage",

  async getAccounts(userId: string): Promise<PortfolioProviderAccount[]> {
    const accounts = await getCurrentBrokerageBalances(userId);
    return accounts.map((account) => ({ id: account.id, label: account.label }));
  },

  async getBalances(userId: string): Promise<BalancesResult[]> {
    const accounts = await getCurrentBrokerageBalances(userId);
    return accounts.map(brokerageAccountToBalancesResult);
  },

  async refreshBalances(userId: string): Promise<void> {
    await syncUserBrokerageBalances(userId);
  },

  getTransactions(userId, range) {
    return getCurrentBrokerageTransactions(userId, range);
  },

  async getTransactionStatus(
    userId: string,
  ): Promise<ProviderTransactionStatus> {
    const status = await getBrokerageTransactionImportStatus(userId);
    return {
      phase: status.isSyncing ? "catching_up" : "up_to_date",
      hasMore: status.isSyncing,
      latestTransactionUpdatedAt: null,
    };
  },
};
