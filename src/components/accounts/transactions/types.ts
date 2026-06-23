import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

export type TransactionHistoryStatus = {
  earliestTransactionAt: string | null;
  latestTransactionAt: string | null;
  hasMore: boolean;
};

export type TransactionsPanel = {
  transactions: InvestmentTransactionListItem[];
  onRefresh: () => void;
  busy: boolean;
  error: string | null;
  message: string | null;
  historyStatus?: TransactionHistoryStatus;
};
