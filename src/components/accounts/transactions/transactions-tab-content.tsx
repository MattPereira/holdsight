"use client";

import { useMemo, useState } from "react";

import { TransactionJournalSwitcher } from "@/components/accounts/transactions/transaction-journal-switcher";
import { TransactionsSymbolFilter } from "@/components/accounts/transactions/transactions-symbol-filter";
import { TransactionsTable } from "@/components/accounts/transactions/transactions-table";
import type { TransactionsPanel } from "@/components/accounts/transactions/types";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 20, 30];
const DEFAULT_PAGE_SIZE = 10;

export function TransactionsTabContent({
  panel,
}: {
  panel: TransactionsPanel;
}) {
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [symbol, setSymbol] = useState<string | null>(null);

  // Unique base asset symbols across all loaded transactions, for the filter.
  const symbols = useMemo(() => {
    const seen = new Set<string>();
    for (const tx of panel.transactions) {
      if (tx.baseAssetSymbol) seen.add(tx.baseAssetSymbol);
    }
    return Array.from(seen).sort();
  }, [panel.transactions]);

  const filteredTransactions = useMemo(
    () =>
      symbol
        ? panel.transactions.filter((tx) => tx.baseAssetSymbol === symbol)
        : panel.transactions,
    [panel.transactions, symbol],
  );

  const total = filteredTransactions.length;

  // Snap back to the first page whenever the visible set changes (a sync adds
  // rows, or the symbol filter changes), so we never linger on a page that no
  // longer exists.
  const [syncedTotal, setSyncedTotal] = useState(total);
  if (syncedTotal !== total) {
    setSyncedTotal(total);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageTransactions = filteredTransactions.slice(start, start + pageSize);

  function handleSymbolChange(next: string | null) {
    setSymbol(next);
    setPage(1);
  }

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    setPage(1);
  }

  return (
    <TransactionJournalSwitcher>
      {(selectTransaction) => (
        <div className="flex flex-col gap-4">
          {panel.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {panel.error}
            </p>
          ) : null}

          {panel.message ? (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {panel.message}
            </p>
          ) : null}

          {panel.transactions.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <TransactionsSymbolFilter
                  symbols={symbols}
                  value={symbol}
                  onChange={handleSymbolChange}
                />

                <Select
                  value={String(pageSize)}
                  onValueChange={handlePageSizeChange}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="Transactions per page"
                    className="w-[64px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <TransactionsTable
            transactions={pageTransactions}
            onEditJournal={selectTransaction}
          />

          {pageCount > 1 ? (
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent className="gap-1">
                <PaginationItem>
                  <PaginationPrevious
                    text=""
                    aria-disabled={currentPage <= 1}
                    className={cn(
                      "cursor-pointer",
                      currentPage <= 1 && "pointer-events-none opacity-50",
                    )}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-1 text-sm tabular-nums text-muted-foreground">
                    {currentPage} / {pageCount}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    text=""
                    aria-disabled={currentPage >= pageCount}
                    className={cn(
                      "cursor-pointer",
                      currentPage >= pageCount && "pointer-events-none opacity-50",
                    )}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </div>
      )}
    </TransactionJournalSwitcher>
  );
}
