import { useMemo, useState, useTransition } from "react";

import { AccountDetailsShell } from "@/components/accounts/account-details-shell";
import type { BalanceGroup, SecondaryColumn } from "@/components/accounts/types";
import type { CurrentBrokerageTransaction } from "@/lib/brokerage/transactions";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";

type TransactionsConfig<TTransactionResult> = {
  initialTransactions: CurrentBrokerageTransaction[];
  loadTransactions: () => Promise<TTransactionResult>;
  getTransactions: (
    result: TTransactionResult,
  ) => CurrentBrokerageTransaction[];
  getError?: (result: TTransactionResult) => string | null;
  getMessage?: (result: TTransactionResult) => string | null;
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
    CurrentBrokerageTransaction[] | undefined
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

  function handleRefreshTransactions() {
    if (!transactions) return;

    setTransactionError(null);
    setTransactionMessage(null);
    startTransactionTransition(async () => {
      const result = await transactions.loadTransactions();
      setCurrentTransactions(transactions.getTransactions(result));
      setTransactionError(transactions.getError?.(result) ?? null);
      setTransactionMessage(transactions.getMessage?.(result) ?? null);
    });
  }

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
              busy: isTransactionPending,
              error: transactionError,
              message: transactionMessage,
            }
          : undefined
      }
    />
  );
}
