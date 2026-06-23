"use client";

import {
  loadKrakenBalances,
  loadKrakenTransactions,
} from "@/app/actions";
import { AccountDetailsClient } from "@/components/accounts/account-details-client";
import {
  WALLET_SECONDARY_COLUMN,
  balancesResultsToGroups,
} from "@/components/accounts/balances/groups";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import type { BalancesResult } from "@/lib/portfolio/types";
import type {
  CurrentKrakenTransaction,
  KrakenTransactionHistoryStatus,
} from "@/lib/exchange/kraken/transactions";

function identityBalancesResult(results: BalancesResult[]): BalancesResult[] {
  return results;
}

export function ExchangesDetailsPage({
  initialResults,
  initialTransactions,
  initialHistoryStatus,
}: {
  initialResults: BalancesResult[];
  initialTransactions: CurrentKrakenTransaction[];
  initialHistoryStatus: KrakenTransactionHistoryStatus;
}) {
  return (
    <AccountDetailsClient
      title="Exchanges"
      initialBalances={initialResults}
      loadBalances={loadKrakenBalances}
      getBalances={identityBalancesResult}
      balancesToGroups={balancesResultsToGroups}
      balancesToSummary={portfolioAssetSummary}
      secondaryColumn={WALLET_SECONDARY_COLUMN}
      transactions={{
        initialTransactions,
        loadTransactions: loadKrakenTransactions,
        getTransactions: (result) => result.transactions,
        getError: (result) => result.error,
        getMessage: (result) => result.message || null,
        initialHistoryStatus,
        getHistoryStatus: (result) => result.historyStatus,
      }}
    />
  );
}
