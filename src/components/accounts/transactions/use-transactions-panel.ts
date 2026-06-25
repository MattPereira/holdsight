import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import type {
  TransactionHistoryStatus,
  TransactionsPanel,
} from "@/components/accounts/transactions/types";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

const TRANSACTION_SYNC_POLL_MS = 4000;

export type TransactionsPanelConfig<TTransactionResult> = {
  initialTransactions: InvestmentTransactionListItem[];
  loadTransactions: () => Promise<TTransactionResult>;
  // Read-only counterpart used to poll an in-progress sync. It receives the
  // rendered count so implementations can avoid returning an unchanged list.
  // Falls back to loadTransactions when omitted.
  pollTransactions?: (
    knownTransactionCount?: number,
    knownLatestTransactionUpdatedAt?: string | null,
  ) => Promise<TTransactionResult>;
  getTransactions: (
    result: TTransactionResult,
  ) => InvestmentTransactionListItem[] | null;
  getError?: (result: TTransactionResult) => string | null;
  getMessage?: (result: TTransactionResult) => string | null;
  initialIsSyncing?: boolean;
  getIsSyncing?: (result: TTransactionResult) => boolean;
  initialHistoryStatus?: TransactionHistoryStatus;
  getHistoryStatus?: (result: TTransactionResult) => TransactionHistoryStatus;
};

/**
 * Owns transaction state for an account view: the current rows, sync status,
 * the refresh handler, and the polling loop that keeps an in-progress sync
 * climbing live. Returns a {@link TransactionsPanel} ready to hand to the
 * account details chrome, or `undefined` when no transactions are configured.
 *
 * A sync runs in durable background workflows, so a single load only captures a
 * snapshot. While more pages remain, this polls so the count climbs live and
 * the status resolves to a terminal state on its own.
 */
export function useTransactionsPanel<TTransactionResult>(
  config?: TransactionsPanelConfig<TTransactionResult>,
): TransactionsPanel | undefined {
  const [currentTransactions, setCurrentTransactions] = useState<
    InvestmentTransactionListItem[] | undefined
  >(config?.initialTransactions);
  const [syncedInitialTransactions, setSyncedInitialTransactions] = useState(
    config?.initialTransactions,
  );
  const [syncedInitialHistoryStatus, setSyncedInitialHistoryStatus] =
    useState(config?.initialHistoryStatus);
  const [syncedInitialIsSyncing, setSyncedInitialIsSyncing] = useState(
    config?.initialIsSyncing,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<
    TransactionHistoryStatus | undefined
  >(config?.initialHistoryStatus);
  const [isSyncing, setSyncing] = useState(config?.initialIsSyncing ?? false);
  const [isPending, startTransition] = useTransition();

  // Re-seed local state whenever the server sends fresh transactions — e.g.
  // after a router.refresh(). Adjusting state during render keeps the view in
  // sync with the server without an effect.
  if (
    config &&
    (syncedInitialTransactions !== config.initialTransactions ||
      syncedInitialHistoryStatus !== config.initialHistoryStatus ||
      syncedInitialIsSyncing !== config.initialIsSyncing)
  ) {
    setSyncedInitialTransactions(config.initialTransactions);
    setSyncedInitialHistoryStatus(config.initialHistoryStatus);
    setSyncedInitialIsSyncing(config.initialIsSyncing);
    setCurrentTransactions(config.initialTransactions);
    setHistoryStatus(config.initialHistoryStatus);
    setSyncing(config.initialIsSyncing ?? false);
    setError(null);
    setMessage(null);
  }

  const applyResult = useCallback(
    (result: TTransactionResult) => {
      if (!config) return;
      const nextTransactions = config.getTransactions(result);
      if (nextTransactions) setCurrentTransactions(nextTransactions);
      setError(config.getError?.(result) ?? null);
      setMessage(config.getMessage?.(result) ?? null);
      setHistoryStatus(config.getHistoryStatus?.(result));
      setSyncing(config.getIsSyncing?.(result) ?? false);
    },
    [config],
  );

  const handleRefresh = useCallback(() => {
    if (!config) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        applyResult(await config.loadTransactions());
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Failed to refresh transactions.",
        );
        setSyncing(false);
      }
    });
  }, [config, applyResult]);

  const isSyncActive = isSyncing || Boolean(historyStatus?.hasMore);

  useEffect(() => {
    if (!config || !isSyncActive || error || isPending) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const interval = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await (config.pollTransactions
          ? config.pollTransactions(
              currentTransactions?.length,
              historyStatus?.latestTransactionUpdatedAt,
            )
          : config.loadTransactions());
        if (!cancelled) applyResult(result);
      } finally {
        inFlight = false;
      }
    }, TRANSACTION_SYNC_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    config,
    isSyncActive,
    error,
    isPending,
    applyResult,
    currentTransactions?.length,
    historyStatus?.latestTransactionUpdatedAt,
  ]);

  return useMemo(() => {
    if (!config || !currentTransactions) return undefined;
    return {
      transactions: currentTransactions,
      onRefresh: handleRefresh,
      busy: isPending || isSyncActive,
      error,
      message,
      historyStatus,
    };
  }, [
    config,
    currentTransactions,
    handleRefresh,
    isPending,
    isSyncActive,
    error,
    message,
    historyStatus,
  ]);
}
