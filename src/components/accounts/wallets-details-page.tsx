"use client";

import {
  loadWalletBalances,
  loadWalletTransactions,
  pollWalletTransactions,
} from "@/app/actions";
import { AccountDetailsClient } from "@/components/accounts/account-details-client";
import {
  WALLET_SECONDARY_COLUMN,
  balancesResultsToGroups,
} from "@/components/accounts/balances/groups";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import type { BalancesResult } from "@/lib/portfolio/types";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import type { WalletTransactionHistoryStatus } from "@/lib/wallets/transactions";

function identityBalancesResult(results: BalancesResult[]): BalancesResult[] {
  return results;
}

export function WalletsDetailsPage({
  initialResults,
  initialTransactions,
  initialHistoryStatus,
}: {
  initialResults: BalancesResult[];
  initialTransactions: InvestmentTransactionListItem[];
  initialHistoryStatus: WalletTransactionHistoryStatus;
}) {
  return (
    <AccountDetailsClient
      title="Wallets"
      initialBalances={initialResults}
      loadBalances={loadWalletBalances}
      getBalances={identityBalancesResult}
      balancesToGroups={balancesResultsToGroups}
      balancesToSummary={portfolioAssetSummary}
      secondaryColumn={WALLET_SECONDARY_COLUMN}
      transactions={{
        initialTransactions,
        loadTransactions: loadWalletTransactions,
        pollTransactions: pollWalletTransactions,
        getTransactions: (result) => result.transactions,
        getError: (result) => result.error,
        getMessage: (result) => result.message || null,
        initialHistoryStatus,
        getHistoryStatus: (result) => result.historyStatus,
      }}
    />
  );
}
