import type { TransactionHistoryStatus } from "@/components/accounts/transactions/types";
import type { TransactionSyncPhase } from "@/lib/investment-transactions/ingestion";
import type {
  InvestmentTransactionListItem,
  TransactionExecutedAtRange,
} from "@/lib/investment-transactions/list-item";
import type { BalancesResult } from "@/lib/portfolio/types";

/**
 * One Investment Provider's transaction sync state, normalized so the registry
 * can reconcile every adapter's status the same way regardless of how the
 * underlying provider models "still syncing" / "has more history".
 */
export type ProviderTransactionStatus = {
  phase: TransactionSyncPhase;
  hasMore: boolean;
  latestTransactionUpdatedAt: string | null;
};

/** The minimal account descriptor every adapter can expose. */
export type PortfolioProviderAccount = {
  id: string;
  label: string | null;
};

/**
 * The common shape of a top-level Investment Provider grouping (wallet, kraken,
 * brokerage). Adapters hide provider enumeration and any intra-group sequencing
 * (e.g. the wallet adapter's EVM→HyperCore→Lighter ordering) behind these
 * methods so the registry can treat every provider uniformly.
 */
export type PortfolioProviderAdapter = {
  id: string;
  getAccounts(userId: string): Promise<PortfolioProviderAccount[]>;
  getBalances(userId: string): Promise<BalancesResult[]>;
  refreshBalances(userId: string): Promise<void>;
  getTransactions(
    userId: string,
    range?: TransactionExecutedAtRange,
  ): Promise<InvestmentTransactionListItem[]>;
  getTransactionStatus(userId: string): Promise<ProviderTransactionStatus>;
};

export type ProviderTransactionsSnapshot = {
  transactions: InvestmentTransactionListItem[];
  historyStatus: TransactionHistoryStatus;
  isSyncing: boolean;
};
