"use client";

import { useState } from "react";

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

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "numeric",
});

function historyLabel(panel: TransactionsPanel, total: number): string {
  const count = `${total} transaction${total === 1 ? "" : "s"}`;
  const status = panel.historyStatus;
  if (!status) return count;

  const { earliestTransactionAt, latestTransactionAt, hasMore } = status;
  if (!earliestTransactionAt || !latestTransactionAt) {
    return count;
  }

  const range = `${dateFormat.format(new Date(earliestTransactionAt))} to ${dateFormat.format(new Date(latestTransactionAt))}`;
  const label = `${count} from ${range}`;
  return hasMore ? `${label} · syncing…` : label;
}

export function TransactionsTabContent({
  panel,
}: {
  panel: TransactionsPanel;
}) {
  const total = panel.transactions.length;

  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  // Snap back to the first page whenever the underlying set changes (e.g. a
  // sync adds rows), so we never linger on a page that no longer exists.
  const [syncedTotal, setSyncedTotal] = useState(total);
  if (syncedTotal !== total) {
    setSyncedTotal(total);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageTransactions = panel.transactions.slice(start, start + pageSize);

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    setPage(1);
  }

  const status = historyLabel(panel, total);

  return (
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

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="text-sm font-normal text-muted-foreground">
            {status}
          </span>

          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
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
      ) : null}

      <TransactionsTable transactions={pageTransactions} />

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
  );
}
