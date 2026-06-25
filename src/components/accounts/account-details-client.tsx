import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { AccountDetailsShell } from "@/components/accounts/account-details-shell";
import type { TransactionHistoryStatus } from "@/components/accounts/transactions/types";
import type { BalanceGroup, SecondaryColumn } from "@/components/accounts/types";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";

const TRANSACTION_SYNC_POLL_MS = 4000;

type TransactionsConfig<TTransactionResult> = {
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

export function AccountDetailsClient<TBalances, TBalanceResult, TTransactionResult>({
  balancesToGroups,
  balancesToSummary,
  deriveBalancesError,
  emptyMessage,
  getBalances,
  getBalancesError,
  initialBalances,
  loadBalances,
  secondaryColumn,
  title,
  transactions,
}: {
  balancesToGroups: (balances: TBalances) => BalanceGroup[];
  balancesToSummary: (balances: TBalances) => PortfolioAssetSummary;
  deriveBalancesError?: (balances: TBalances) => string | null;
  emptyMessage?: string | ((balances: TBalances) => string | undefined);
  getBalances: (result: TBalanceResult) => TBalances;
  getBalancesError?: (result: TBalanceResult) => string | null;
  initialBalances: TBalances;
  loadBalances: () => Promise<TBalanceResult>;
  secondaryColumn: SecondaryColumn;
  title: string;
  transactions?: TransactionsConfig<TTransactionResult>;
}) {
  const [balances, setBalances] = useState<TBalances>(initialBalances);
  const [currentTransactions, setCurrentTransactions] = useState<
    InvestmentTransactionListItem[] | undefined
  >(transactions?.initialTransactions);
  const [syncedInitialBalances, setSyncedInitialBalances] =
    useState(initialBalances);
  const [syncedInitialTransactions, setSyncedInitialTransactions] = useState(
    transactions?.initialTransactions,
  );
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionMessage, setTransactionMessage] = useState<string | null>(
    null,
  );
  const [transactionHistoryStatus, setTransactionHistoryStatus] =
    useState<TransactionHistoryStatus | undefined>(transactions?.initialHistoryStatus);
  const [isTransactionSyncing, setTransactionSyncing] = useState(
    transactions?.initialIsSyncing ?? false,
  );
  const [isBalancePending, startBalanceTransition] = useTransition();
  const [isTransactionPending, startTransactionTransition] = useTransition();

  if (syncedInitialBalances !== initialBalances) {
    setSyncedInitialBalances(initialBalances);
    setBalances(initialBalances);
    setBalanceError(null);
    setTransactionError(null);
    setTransactionMessage(null);
  }

  if (
    transactions &&
    syncedInitialTransactions !== transactions.initialTransactions
  ) {
    setSyncedInitialTransactions(transactions.initialTransactions);
    setCurrentTransactions(transactions.initialTransactions);
    setTransactionHistoryStatus(transactions.initialHistoryStatus);
    setTransactionSyncing(transactions.initialIsSyncing ?? false);
    setTransactionError(null);
    setTransactionMessage(null);
  }

  const groups = useMemo(
    () => balancesToGroups(balances),
    [balances, balancesToGroups],
  );
  const summary = useMemo(
    () => balancesToSummary(balances),
    [balances, balancesToSummary],
  );
  const syncError = useMemo(
    () => deriveBalancesError?.(balances) ?? null,
    [balances, deriveBalancesError],
  );
  const displayedError = balanceError ?? syncError;
  const displayedEmptyMessage =
    typeof emptyMessage === "function" ? emptyMessage(balances) : emptyMessage;

  function handleRefreshBalances() {
    setBalanceError(null);
    startBalanceTransition(async () => {
      const result = await loadBalances();
      setBalances(getBalances(result));
      setBalanceError(getBalancesError?.(result) ?? null);
    });
  }

  const applyTransactionResult = useCallback(
    (result: TTransactionResult) => {
      if (!transactions) return;
      const nextTransactions = transactions.getTransactions(result);
      if (nextTransactions) setCurrentTransactions(nextTransactions);
      setTransactionError(transactions.getError?.(result) ?? null);
      setTransactionMessage(transactions.getMessage?.(result) ?? null);
      setTransactionHistoryStatus(transactions.getHistoryStatus?.(result));
      setTransactionSyncing(transactions.getIsSyncing?.(result) ?? false);
    },
    [transactions],
  );

  function handleRefreshTransactions() {
    if (!transactions) return;

    setTransactionError(null);
    setTransactionMessage(null);
    startTransactionTransition(async () => {
      applyTransactionResult(await transactions.loadTransactions());
    });
  }

  // A sync runs in durable background workflows, so a single load only captures
  // a snapshot. While more pages remain, poll so the count climbs live and the
  // status resolves to a terminal state on its own.
  const isTransactionSyncActive =
    isTransactionSyncing || Boolean(transactionHistoryStatus?.hasMore);

  useEffect(() => {
    if (
      !transactions ||
      !isTransactionSyncActive ||
      transactionError ||
      isTransactionPending
    ) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const interval = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await (transactions.pollTransactions
          ? transactions.pollTransactions(
              currentTransactions?.length,
              transactionHistoryStatus?.latestTransactionUpdatedAt,
            )
          : transactions.loadTransactions());
        if (!cancelled) applyTransactionResult(result);
      } finally {
        inFlight = false;
      }
    }, TRANSACTION_SYNC_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    transactions,
    isTransactionSyncActive,
    transactionError,
    isTransactionPending,
    applyTransactionResult,
    currentTransactions?.length,
    transactionHistoryStatus?.latestTransactionUpdatedAt,
  ]);

  return (
    <AccountDetailsShell
      title={title}
      groups={groups}
      secondaryColumn={secondaryColumn}
      summary={summary}
      onRefreshBalances={handleRefreshBalances}
      balancesBusy={isBalancePending}
      balancesError={displayedError}
      emptyMessage={displayedEmptyMessage}
      transactions={
        transactions && currentTransactions
          ? {
              transactions: currentTransactions,
              onRefresh: handleRefreshTransactions,
              busy: isTransactionPending || isTransactionSyncActive,
              error: transactionError,
              message: transactionMessage,
              historyStatus: transactionHistoryStatus,
            }
          : undefined
      }
    />
  );
}
