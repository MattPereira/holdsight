import "server-only";

import { getUserEvmAccounts } from "@/lib/evm/accounts";
import { getCurrentEvmBalances, syncEvmWalletBalances } from "@/lib/evm/balances";
import {
  ensureUserHyperCoreAccounts,
  getUserHyperCoreAccounts,
} from "@/lib/hyper-core/accounts";
import {
  getCurrentHyperCoreBalances,
  syncHyperCoreAccounts,
} from "@/lib/hyper-core/balances";
import { getUserLighterAccounts } from "@/lib/lighter/accounts";
import {
  getCurrentLighterBalances,
  syncLighterAccounts,
} from "@/lib/lighter/balances";
import { mergeWalletBalanceResults } from "@/lib/wallets/balance-merge";
import {
  getCurrentWalletTransactions,
  getWalletTransactionHistoryStatus,
} from "@/lib/wallets/transactions";
import type { BalancesResult } from "@/lib/portfolio/types";

import type {
  PortfolioProviderAccount,
  PortfolioProviderAdapter,
  ProviderTransactionStatus,
} from "./types";

/**
 * The wallet family adapter. Owns the EVM→HyperCore→Lighter sequencing as
 * domain knowledge: HyperCore accounts must be ensured (auto-derived) from the
 * EVM wallet addresses before their balances can be read or synced, and Lighter
 * accounts are user-connected but grouped under the same wallet addresses.
 */
export const walletAdapter: PortfolioProviderAdapter = {
  id: "wallet",

  async getAccounts(userId: string): Promise<PortfolioProviderAccount[]> {
    const [evmAccounts, hyperCoreAccounts, lighterAccounts] = await Promise.all([
      getUserEvmAccounts(userId),
      getUserHyperCoreAccounts(userId),
      getUserLighterAccounts(userId),
    ]);
    return [...evmAccounts, ...hyperCoreAccounts, ...lighterAccounts].map(
      (account) => ({ id: account.id, label: account.label }),
    );
  },

  async getBalances(userId: string): Promise<BalancesResult[]> {
    const evmAccounts = await getUserEvmAccounts(userId);
    const hyperCoreAccounts = await ensureUserHyperCoreAccounts(
      userId,
      evmAccounts,
    );
    const lighterAccounts = await getUserLighterAccounts(userId);
    const [evmResults, hyperCoreResults, lighterResults] = await Promise.all([
      getCurrentEvmBalances(userId),
      getCurrentHyperCoreBalances(hyperCoreAccounts),
      getCurrentLighterBalances(lighterAccounts),
    ]);
    return mergeWalletBalanceResults(
      evmResults,
      hyperCoreResults,
      lighterResults,
    );
  },

  async refreshBalances(userId: string): Promise<void> {
    const wallets = await getUserEvmAccounts(userId);
    if (wallets.length === 0) return;

    await syncEvmWalletBalances(wallets);

    const hyperCoreAccounts = await ensureUserHyperCoreAccounts(
      userId,
      wallets,
    );
    await syncHyperCoreAccounts(hyperCoreAccounts);

    const lighterAccounts = await getUserLighterAccounts(userId);
    await syncLighterAccounts(userId, lighterAccounts);
  },

  async getTransactions(userId, range) {
    return getCurrentWalletTransactions(userId, range);
  },

  async getTransactionStatus(
    userId: string,
  ): Promise<ProviderTransactionStatus> {
    const [evmAccounts, hyperCoreAccounts, lighterAccounts] = await Promise.all([
      getUserEvmAccounts(userId),
      getUserHyperCoreAccounts(userId),
      getUserLighterAccounts(userId),
    ]);
    const status = await getWalletTransactionHistoryStatus(
      userId,
      evmAccounts,
      hyperCoreAccounts,
      lighterAccounts,
    );
    return {
      phase: status.phase,
      hasMore: status.hasMore,
      latestTransactionUpdatedAt: status.latestTransactionUpdatedAt,
    };
  },
};
