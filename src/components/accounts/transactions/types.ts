import type { TransactionSyncPhase } from "@/lib/investment-transactions/ingestion";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

export type TransactionHistoryStatus = {
  earliestTransactionAt: string | null;
  latestTransactionAt: string | null;
  latestTransactionUpdatedAt?: string | null;
  hasMore: boolean;
  phase?: TransactionSyncPhase;
};

export type TransactionsPanel = {
  transactions: InvestmentTransactionListItem[];
  onRefresh: () => void;
  busy: boolean;
  error: string | null;
  message: string | null;
  historyStatus?: TransactionHistoryStatus;
};
