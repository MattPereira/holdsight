import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import type {
  TransactionHistoryStatus,
  TransactionsPanel,
  TransactionsView,
} from "@/components/accounts/transactions/types";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

const TRANSACTION_SYNC_POLL_MS = 4000;

export type TransactionsSource = {
  /** Server-rendered snapshot the panel seeds from and re-seeds on refresh. */
  initial: TransactionsView;
  /** Refreshes the feed — may claim leases and start sync workflows. */
  refreshAction: () => Promise<TransactionsView>;
  // Read-only counterpart used to poll an in-progress sync. It receives the
  // rendered count and latest-updated timestamp so implementations can return
  // an unchanged (null) list. Falls back to refresh when omitted.
  pollAction?: (
    knownTransactionCount?: number,
    knownLatestTransactionUpdatedAt?: string | null,
  ) => Promise<TransactionsView>;
};

/**
 * Owns transaction state for an account view: the current rows, sync status,
 * the refresh handler, and the polling loop that keeps an in-progress sync
 * climbing live. Returns a {@link TransactionsPanel} ready to hand to the
 * account details chrome, or `undefined` when no transactions are configured.
 *
 * A sync runs in durable background workflows, so a single load only captures a
 * snapshot. While `historyStatus.hasMore`, this polls so the count climbs live
 * and the status resolves to a terminal state on its own.
 */
export function useTransactionsPanel(
  source?: TransactionsSource,
): TransactionsPanel | undefined {
  const initial = source?.initial;
  const [currentTransactions, setCurrentTransactions] = useState<
    InvestmentTransactionListItem[] | undefined
  >(initial?.transactions ?? undefined);
  const [syncedInitial, setSyncedInitial] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<
    TransactionHistoryStatus | undefined
  >(initial?.historyStatus);
  const [isPending, startTransition] = useTransition();

  // Re-seed local state whenever the server sends a fresh snapshot — e.g. after
  // a router.refresh(). Adjusting state during render keeps the view in sync
  // with the server without an effect.
  if (initial && syncedInitial !== initial) {
    setSyncedInitial(initial);
    setCurrentTransactions(initial.transactions ?? undefined);
    setHistoryStatus(initial.historyStatus);
    setError(null);
    setMessage(null);
  }

  const applyResult = useCallback((result: TransactionsView) => {
    if (result.transactions) setCurrentTransactions(result.transactions);
    setError(result.error);
    setMessage(result.message || null);
    setHistoryStatus(result.historyStatus);
  }, []);

  const handleRefresh = useCallback(() => {
    if (!source) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        applyResult(await source.refreshAction());
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Failed to refresh transactions.",
        );
      }
    });
  }, [source, applyResult]);

  // An expected provider failure must return control to the user. Polling is
  // intentionally paused while an error is displayed, so keeping `hasMore`
  // active here would leave the refresh button disabled indefinitely.
  const isSyncActive = !error && Boolean(historyStatus?.hasMore);

  useEffect(() => {
    if (!source || !isSyncActive || error || isPending) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const interval = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await (source.pollAction
          ? source.pollAction(
              currentTransactions?.length,
              historyStatus?.latestTransactionUpdatedAt,
            )
          : source.refreshAction());
        if (!cancelled) applyResult(result);
      } catch (error) {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "Failed to check transaction sync status.",
          );
        }
      } finally {
        inFlight = false;
      }
    }, TRANSACTION_SYNC_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    source,
    isSyncActive,
    error,
    isPending,
    applyResult,
    currentTransactions?.length,
    historyStatus?.latestTransactionUpdatedAt,
  ]);

  return useMemo(() => {
    if (!source || !currentTransactions) return undefined;
    return {
      transactions: currentTransactions,
      onRefresh: handleRefresh,
      // Background synchronization is represented by historyStatus.hasMore and
      // must not prevent the user from submitting another lease-safe refresh.
      // Only the request currently crossing the network disables the control.
      refreshPending: isPending,
      error,
      message,
      historyStatus,
    };
  }, [
    source,
    currentTransactions,
    handleRefresh,
    isPending,
    error,
    message,
    historyStatus,
  ]);
}
