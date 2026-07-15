"use client";

import { useMemo } from "react";

import {
  loadPortfolioTransactions,
  pollPortfolioTransactions,
  type PortfolioTransactionsActionResult,
} from "@/app/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { TransactionsTabContent } from "@/components/accounts/transactions/transactions-tab-content";
import type { TransactionHistoryStatus } from "@/components/accounts/transactions/types";
import { useTransactionsPanel } from "@/components/accounts/transactions/use-transactions-panel";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

export type TradesPageData = {
  transactions: InvestmentTransactionListItem[];
  transactionHistoryStatus: TransactionHistoryStatus;
};

export function TradesPage({ initialData }: { initialData: TradesPageData }) {
  const transactionsConfig = useMemo(
    () => ({
      initialTransactions: initialData.transactions,
      loadTransactions: loadPortfolioTransactions,
      pollTransactions: pollPortfolioTransactions,
      getTransactions: (result: PortfolioTransactionsActionResult) =>
        result.transactions,
      getError: (result: PortfolioTransactionsActionResult) => result.error,
      getMessage: (result: PortfolioTransactionsActionResult) =>
        result.message || null,
      initialHistoryStatus: initialData.transactionHistoryStatus,
      getHistoryStatus: (result: PortfolioTransactionsActionResult) =>
        result.historyStatus,
      initialIsSyncing: initialData.transactionHistoryStatus.hasMore,
      getIsSyncing: (result: PortfolioTransactionsActionResult) =>
        result.isSyncing,
    }),
    [initialData.transactions, initialData.transactionHistoryStatus],
  );

  const panel = useTransactionsPanel(transactionsConfig);
  const refreshBusy = panel?.refreshPending ?? false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trades"
        onRefresh={panel?.onRefresh}
        refreshBusy={refreshBusy}
        refreshLabel="Sync"
        refreshBusyLabel="Syncing"
      />

      {panel ? <TransactionsTabContent panel={panel} /> : null}
    </div>
  );
}
