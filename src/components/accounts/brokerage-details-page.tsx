"use client";

import {
  loadBrokerageBalances,
  loadBrokerageTransactions,
} from "@/app/actions";
import { AccountDetailsClient } from "@/components/accounts/account-details-client";
import {
  BROKERAGE_SECONDARY_COLUMN,
  brokerageAccountsToGroups,
} from "@/components/accounts/balances/groups";
import type { CurrentBrokerageAccount } from "@/lib/brokerage/balances";
import type { CurrentBrokerageTransaction } from "@/lib/brokerage/transactions";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import type { BalancesResult } from "@/lib/portfolio/types";

// Reuse the portfolio summary/allocations machinery, which speaks in
// BalancesResult. Brokerage holdings have no chain, so we tag them "brokerage".
function toBalancesResults(
  accounts: CurrentBrokerageAccount[],
): BalancesResult[] {
  return accounts.map((account) => ({
    status: "ready",
    address: account.label ?? account.id,
    balances: account.balances.map((balance) => ({
      sourceBalanceId: balance.sourceBalanceId,
      symbol: balance.symbol,
      name: balance.name,
      chainId: "brokerage",
      amount: balance.amount,
      priceUsd: balance.priceUsd,
      valueUsd: balance.valueUsd,
    })),
  }));
}

function accountSyncError(accounts: CurrentBrokerageAccount[]): string | null {
  return (
    accounts
      .filter((account) => account.syncStatus === "error")
      .map((account) => account.syncErrorMessage?.trim())
      .find((message): message is string => Boolean(message)) ?? null
  );
}

function brokerageAccountsToSummary(accounts: CurrentBrokerageAccount[]) {
  return portfolioAssetSummary(toBalancesResults(accounts));
}

function brokerageEmptyMessage(
  accounts: CurrentBrokerageAccount[],
): string | undefined {
  return accounts.length === 0
    ? "No brokerage linked yet. Connect an account to load balances."
    : undefined;
}

export function BrokerageDetailsPage({
  initialAccounts,
  initialTransactions,
  initialTransactionsSyncing,
}: {
  initialAccounts: CurrentBrokerageAccount[];
  initialTransactions: CurrentBrokerageTransaction[];
  initialTransactionsSyncing: boolean;
}) {
  return (
    <AccountDetailsClient
      title="Brokerages"
      initialBalances={initialAccounts}
      loadBalances={loadBrokerageBalances}
      getBalances={(result) => result.accounts}
      getBalancesError={(result) => result.error}
      balancesToGroups={brokerageAccountsToGroups}
      balancesToSummary={brokerageAccountsToSummary}
      deriveBalancesError={accountSyncError}
      emptyMessage={brokerageEmptyMessage}
      secondaryColumn={BROKERAGE_SECONDARY_COLUMN}
      transactions={{
        initialTransactions,
        loadTransactions: loadBrokerageTransactions,
        getTransactions: (result) => result.transactions,
        getError: (result) => result.error,
        getMessage: (result) => result.message || null,
        initialIsSyncing: initialTransactionsSyncing,
        getIsSyncing: (result) => result.isSyncing,
      }}
    />
  );
}
