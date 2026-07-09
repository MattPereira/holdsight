import "server-only";

import { getUserKrakenAccounts } from "@/lib/exchange/kraken/accounts";
import {
  getCurrentUserKrakenBalances,
  syncUserKrakenAccounts,
} from "@/lib/exchange/kraken/balances";
import {
  getCurrentKrakenTransactions,
  getKrakenTransactionHistoryStatus,
} from "@/lib/exchange/kraken/transactions";

import type {
  PortfolioProviderAccount,
  PortfolioProviderAdapter,
  ProviderTransactionStatus,
} from "./types";

/** Thin facade over the existing Kraken module. Its depth is candidate 1. */
export const krakenAdapter: PortfolioProviderAdapter = {
  id: "kraken",

  async getAccounts(userId: string): Promise<PortfolioProviderAccount[]> {
    const accounts = await getUserKrakenAccounts(userId);
    return accounts.map((account) => ({ id: account.id, label: account.label }));
  },

  getBalances(userId) {
    return getCurrentUserKrakenBalances(userId);
  },

  async refreshBalances(userId: string): Promise<void> {
    await syncUserKrakenAccounts(userId);
  },

  getTransactions(userId, range) {
    return getCurrentKrakenTransactions(userId, range);
  },

  async getTransactionStatus(
    userId: string,
  ): Promise<ProviderTransactionStatus> {
    const status = await getKrakenTransactionHistoryStatus(userId);
    return {
      phase: status.phase,
      hasMore: status.hasMore,
      latestTransactionUpdatedAt: null,
    };
  },
};
