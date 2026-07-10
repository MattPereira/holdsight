import "server-only";

import type { TransactionHistoryStatus } from "@/components/accounts/transactions/types";
import type { TransactionSyncPhase } from "@/lib/investment-transactions/ingestion";
import type {
  InvestmentTransactionListItem,
  TransactionExecutedAtRange,
} from "@/lib/investment-transactions/list-item";
import { portfolioProviderRegistry } from "@/lib/portfolio/providers/registry";

const SYNC_PHASE_RANK: Record<TransactionSyncPhase, number> = {
  backfilling: 0,
  catching_up: 1,
  up_to_date: 2,
};

/** Picks the least-complete phase across the per-source sync phases. */
function leastCompletePhase(
  phases: TransactionSyncPhase[],
): TransactionSyncPhase {
  let summary: TransactionSyncPhase = "up_to_date";
  for (const phase of phases) {
    if (SYNC_PHASE_RANK[phase] < SYNC_PHASE_RANK[summary]) summary = phase;
  }
  return summary;
}

export type PortfolioTransactionsSnapshot = {
  transactions: InvestmentTransactionListItem[];
  historyStatus: TransactionHistoryStatus;
  isSyncing: boolean;
};

export type PortfolioTransactionSourceStatuses = {
  walletPhase: TransactionSyncPhase;
  walletHasMore: boolean;
  walletLatestTransactionUpdatedAt: string | null;
  krakenPhase: TransactionSyncPhase;
  krakenHasMore: boolean;
  brokerageIsSyncing: boolean;
};

/**
 * Merges the wallet, exchange, and brokerage transaction lists into a single
 * feed and reconciles their independent sync statuses into one
 * {@link TransactionHistoryStatus}. The visible date range is derived from the
 * merged rows themselves (after sorting) rather than each source's own range,
 * which keeps it accurate regardless of how each provider reports its window.
 */
export function mergePortfolioTransactions(
  lists: InvestmentTransactionListItem[][],
  statuses: PortfolioTransactionSourceStatuses,
): PortfolioTransactionsSnapshot {
  const transactions = lists
    .flat()
    .sort((a, b) => b.executedAt.localeCompare(a.executedAt));

  const hasMore =
    statuses.walletHasMore ||
    statuses.krakenHasMore ||
    statuses.brokerageIsSyncing;

  const phase = leastCompletePhase([
    statuses.walletPhase,
    statuses.krakenPhase,
    statuses.brokerageIsSyncing ? "catching_up" : "up_to_date",
  ]);

  return {
    transactions,
    historyStatus: {
      earliestTransactionAt: transactions.at(-1)?.executedAt ?? null,
      latestTransactionAt: transactions[0]?.executedAt ?? null,
      latestTransactionUpdatedAt: statuses.walletLatestTransactionUpdatedAt,
      hasMore,
      phase,
    },
    isSyncing: hasMore,
  };
}

/**
 * Read-only snapshot of every investment transaction source merged into one
 * feed. Used for the home page's initial server render and for polling an
 * in-progress sync; it never starts workflows or revalidates.
 */
export async function getCurrentPortfolioTransactions(
  userId: string,
): Promise<PortfolioTransactionsSnapshot> {
  return portfolioProviderRegistry.getPortfolioTransactions(userId);
}

/** Uses the Portfolio feed's source and visibility rules within one UTC range. */
export async function getPortfolioTransactionsInRange(
  userId: string,
  range: TransactionExecutedAtRange,
): Promise<InvestmentTransactionListItem[]> {
  return portfolioProviderRegistry.getTransactionsInRange(userId, range);
}

export function emptyPortfolioTransactionsSnapshot(): PortfolioTransactionsSnapshot {
  return {
    transactions: [],
    historyStatus: {
      earliestTransactionAt: null,
      latestTransactionAt: null,
      latestTransactionUpdatedAt: null,
      hasMore: false,
      phase: "up_to_date",
    },
    isSyncing: false,
  };
}
