"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useMemo } from "react";

import {
  loadPortfolioTransactions,
  pollPortfolioTransactions,
  type PortfolioTransactionsActionResult,
} from "@/app/actions";
import { TransactionsTabContent } from "@/components/accounts/transactions/transactions-tab-content";
import type { TransactionHistoryStatus } from "@/components/accounts/transactions/types";
import { useTransactionsPanel } from "@/components/accounts/transactions/use-transactions-panel";
import { Button } from "@/components/ui/button";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import { cn } from "@/lib/utils";

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
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Trades</h1>

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={panel?.onRefresh}
          disabled={refreshBusy}
          aria-label={refreshBusy ? "Syncing" : "Sync"}
        >
          <RiRefreshLine className={cn(refreshBusy && "animate-spin")} />
        </Button>
      </div>

      {panel ? <TransactionsTabContent panel={panel} /> : null}
    </div>
  );
}
