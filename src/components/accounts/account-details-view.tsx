"use client";

import { useState, useTransition } from "react";

import { AccountDetailsShell } from "@/components/accounts/account-details-shell";
import {
  useTransactionsPanel,
  type TransactionsSource,
} from "@/components/accounts/transactions/use-transactions-panel";
import type { SecondaryColumn } from "@/components/accounts/types";
import type { BalancesView } from "@/lib/accounts/balances-view";

/**
 * Stateful account details view: owns the balances snapshot and the refresh
 * transition, delegates transaction state to {@link useTransactionsPanel}, and
 * renders the shared chrome. Callers hand it display-ready data and injected
 * refresh functions — the view reads no source-specific result shapes.
 */
export function AccountDetailsView({
  title,
  secondaryColumn,
  initialBalances,
  refreshBalancesAction,
  transactions,
}: {
  title: string;
  secondaryColumn: SecondaryColumn;
  initialBalances: BalancesView;
  refreshBalancesAction: () => Promise<BalancesView>;
  transactions?: TransactionsSource;
}) {
  const [balances, setBalances] = useState<BalancesView>(initialBalances);
  const [syncedInitialBalances, setSyncedInitialBalances] =
    useState(initialBalances);
  const [isBalancePending, startBalanceTransition] = useTransition();

  // Re-seed from the server whenever it sends a fresh snapshot (e.g. after a
  // router.refresh()), matching the transactions panel's render-time re-seed.
  if (syncedInitialBalances !== initialBalances) {
    setSyncedInitialBalances(initialBalances);
    setBalances(initialBalances);
  }

  const transactionsPanel = useTransactionsPanel(transactions);

  function handleRefreshBalances() {
    startBalanceTransition(async () => {
      setBalances(await refreshBalancesAction());
    });
  }

  return (
    <AccountDetailsShell
      title={title}
      groups={balances.groups}
      secondaryColumn={secondaryColumn}
      summary={balances.summary}
      onRefreshBalances={handleRefreshBalances}
      balancesBusy={isBalancePending}
      balancesError={balances.error}
      emptyMessage={balances.emptyMessage}
      transactions={transactionsPanel}
    />
  );
}
