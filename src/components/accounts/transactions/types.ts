import type { TransactionSyncPhase } from "@/lib/investment-transactions/ingestion";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

export type TransactionHistoryStatus = {
  earliestTransactionAt: string | null;
  latestTransactionAt: string | null;
  latestTransactionUpdatedAt?: string | null;
  hasMore: boolean;
  phase?: TransactionSyncPhase;
};

/**
 * The uniform result every provider's transaction load/poll action returns.
 * A `null` `transactions` means "unchanged since the caller's known snapshot"
 * (poll optimization); `historyStatus.hasMore` drives the polling loop, so
 * sources that only report a boolean (brokerage) fold it in there.
 */
export type TransactionsView = {
  transactions: InvestmentTransactionListItem[] | null;
  message: string;
  error: string | null;
  historyStatus: TransactionHistoryStatus;
};

export type TransactionsPanel = {
  transactions: InvestmentTransactionListItem[];
  onRefresh: () => void;
  refreshPending: boolean;
  error: string | null;
  message: string | null;
  historyStatus?: TransactionHistoryStatus;
};
