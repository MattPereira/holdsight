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

function addressKey(address: string): string {
  return address.trim().toLowerCase();
}

function mergeReadyResults(
  current: Extract<BalancesResult, { status: "ready" }>,
  next: Extract<BalancesResult, { status: "ready" }>,
): BalancesResult {
  return {
    ...current,
    balances: [...current.balances, ...next.balances].sort(
      (a, b) => b.valueUsd - a.valueUsd,
    ),
  };
}

/**
 * Merges the EVM, HyperCore, and Lighter balance results that share a wallet
 * address into one row per address. A ready result supersedes a non-ready one
 * for the same address; two ready results have their balances combined.
 */
function mergeWalletBalanceResults(
  ...resultGroups: BalancesResult[][]
): BalancesResult[] {
  const merged = new Map<string, BalancesResult>();

  for (const result of resultGroups.flat()) {
    const key = addressKey(result.address);
    const current = merged.get(key);

    if (!current) {
      merged.set(key, result);
      continue;
    }

    if (current.status === "ready" && result.status === "ready") {
      merged.set(key, mergeReadyResults(current, result));
    } else if (current.status !== "ready" && result.status === "ready") {
      merged.set(key, result);
    }
  }

  return Array.from(merged.values());
}

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
