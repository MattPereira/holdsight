import { useMemo, useState, useTransition } from "react";

import { AccountDetailsShell } from "@/components/accounts/account-details-shell";
import type { TransactionsPanelConfig } from "@/components/accounts/transactions/use-transactions-panel";
import { useTransactionsPanel } from "@/components/accounts/transactions/use-transactions-panel";
import type { BalanceGroup, SecondaryColumn } from "@/components/accounts/types";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";

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
  transactions?: TransactionsPanelConfig<TTransactionResult>;
}) {
  const [balances, setBalances] = useState<TBalances>(initialBalances);
  const [syncedInitialBalances, setSyncedInitialBalances] =
    useState(initialBalances);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isBalancePending, startBalanceTransition] = useTransition();

  if (syncedInitialBalances !== initialBalances) {
    setSyncedInitialBalances(initialBalances);
    setBalances(initialBalances);
    setBalanceError(null);
  }

  const transactionsPanel = useTransactionsPanel(transactions);

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
      transactions={transactionsPanel}
    />
  );
}
