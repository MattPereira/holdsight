import { cache } from "react";

import type { TransactionSyncPhase } from "@/lib/investment-transactions/ingestion";
import type {
  InvestmentTransactionListItem,
  TransactionExecutedAtRange,
} from "@/lib/investment-transactions/list-item";
import type { BalancesResult } from "@/lib/portfolio/types";

import type {
  PortfolioProviderAdapter,
  ProviderTransactionStatus,
  ProviderTransactionsSnapshot,
} from "./types";

const SYNC_PHASE_RANK: Record<TransactionSyncPhase, number> = {
  backfilling: 0,
  catching_up: 1,
  up_to_date: 2,
};

/** Picks the least-complete phase across the per-adapter sync phases. */
function leastCompletePhase(
  phases: TransactionSyncPhase[],
): TransactionSyncPhase {
  let summary: TransactionSyncPhase = "up_to_date";
  for (const phase of phases) {
    if (SYNC_PHASE_RANK[phase] < SYNC_PHASE_RANK[summary]) summary = phase;
  }
  return summary;
}

/** The most recent non-null ISO timestamp, or null when none report one. */
function latestIso(values: (string | null)[]): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (value !== null && (latest === null || value.localeCompare(latest) > 0)) {
      latest = value;
    }
  }
  return latest;
}

/**
 * Merges the per-adapter transaction lists into one feed and reconciles their
 * independent statuses into a single {@link ProviderTransactionsSnapshot}. The
 * visible date range is derived from the merged rows themselves (after sorting)
 * rather than each source's own window, keeping it accurate regardless of how
 * each provider reports its range.
 */
function mergeTransactions(
  lists: InvestmentTransactionListItem[][],
  statuses: ProviderTransactionStatus[],
): ProviderTransactionsSnapshot {
  const transactions = lists
    .flat()
    .sort((a, b) => b.executedAt.localeCompare(a.executedAt));

  const hasMore = statuses.some((status) => status.hasMore);
  const phase = leastCompletePhase(statuses.map((status) => status.phase));

  return {
    transactions,
    historyStatus: {
      earliestTransactionAt: transactions.at(-1)?.executedAt ?? null,
      latestTransactionAt: transactions[0]?.executedAt ?? null,
      latestTransactionUpdatedAt: latestIso(
        statuses.map((status) => status.latestTransactionUpdatedAt),
      ),
      hasMore,
      phase,
    },
    isSyncing: hasMore,
  };
}

/**
 * The Portfolio Provider Registry's small public surface. Hides provider
 * enumeration, the wallet family's internal sequencing, and status
 * reconciliation from every caller behind these purpose-built methods.
 */
export type PortfolioProviderRegistry = {
  refreshAll(userId: string): Promise<void>;
  getPortfolioBalances(userId: string): Promise<BalancesResult[]>;
  getWalletBalances(userId: string): Promise<BalancesResult[]>;
  getPortfolioTransactions(
    userId: string,
  ): Promise<ProviderTransactionsSnapshot>;
  getWalletTransactions(userId: string): Promise<ProviderTransactionsSnapshot>;
  getTransactionsInRange(
    userId: string,
    range: TransactionExecutedAtRange,
  ): Promise<InvestmentTransactionListItem[]>;
};

export type PortfolioProviderRegistryDeps = {
  /** Every top-level adapter, in the order balances/transactions merge in. */
  adapters: PortfolioProviderAdapter[];
  /** The wallet adapter, for the wallet-scoped read methods. */
  walletAdapter: PortfolioProviderAdapter;
  /** Revalidates the portfolio paths after a refresh. Part of refreshAll. */
  revalidate: () => void;
  /** Layers cross-cutting decoration (journal summaries) onto a merged feed. */
  decorateTransactions: (
    userId: string,
    transactions: InvestmentTransactionListItem[],
  ) => Promise<InvestmentTransactionListItem[]>;
};

export function createPortfolioProviderRegistry(
  deps: PortfolioProviderRegistryDeps,
): PortfolioProviderRegistry {
  const { adapters, walletAdapter, revalidate, decorateTransactions } = deps;

  async function collectTransactions(
    userId: string,
    subset: PortfolioProviderAdapter[],
  ): Promise<ProviderTransactionsSnapshot> {
    const [lists, statuses] = await Promise.all([
      Promise.all(subset.map((adapter) => adapter.getTransactions(userId))),
      Promise.all(subset.map((adapter) => adapter.getTransactionStatus(userId))),
    ]);
    const snapshot = mergeTransactions(lists, statuses);
    return {
      ...snapshot,
      transactions: await decorateTransactions(userId, snapshot.transactions),
    };
  }

  const getPortfolioBalances = cache(
    async (userId: string): Promise<BalancesResult[]> => {
      const lists = await Promise.all(
        adapters.map((adapter) => adapter.getBalances(userId)),
      );
      return lists.flat();
    },
  );

  const getWalletBalances = cache(
    (userId: string): Promise<BalancesResult[]> =>
      walletAdapter.getBalances(userId),
  );

  const getPortfolioTransactions = cache(
    (userId: string): Promise<ProviderTransactionsSnapshot> =>
      collectTransactions(userId, adapters),
  );

  const getWalletTransactions = cache(
    (userId: string): Promise<ProviderTransactionsSnapshot> =>
      collectTransactions(userId, [walletAdapter]),
  );

  async function refreshAll(userId: string): Promise<void> {
    await Promise.all(
      adapters.map((adapter) => adapter.refreshBalances(userId)),
    );
    revalidate();
  }

  async function getTransactionsInRange(
    userId: string,
    range: TransactionExecutedAtRange,
  ): Promise<InvestmentTransactionListItem[]> {
    const lists = await Promise.all(
      adapters.map((adapter) => adapter.getTransactions(userId, range)),
    );
    const transactions = lists
      .flat()
      .sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    return decorateTransactions(userId, transactions);
  }

  return {
    refreshAll,
    getPortfolioBalances,
    getWalletBalances,
    getPortfolioTransactions,
    getWalletTransactions,
    getTransactionsInRange,
  };
}
