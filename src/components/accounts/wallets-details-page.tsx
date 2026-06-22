"use client";

import { loadWalletBalances } from "@/app/actions";
import { AccountDetailsClient } from "@/components/accounts/account-details-client";
import {
  WALLET_SECONDARY_COLUMN,
  balancesResultsToGroups,
} from "@/components/accounts/balances/groups";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import type { BalancesResult } from "@/lib/portfolio/types";

function identityBalancesResult(results: BalancesResult[]): BalancesResult[] {
  return results;
}

export function WalletsDetailsPage({
  initialResults,
}: {
  initialResults: BalancesResult[];
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
    />
  );
}
