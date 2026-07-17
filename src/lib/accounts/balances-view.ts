import {
  balancesResultsToGroups,
  brokerageAccountsToGroups,
} from "@/components/accounts/balances/groups";
import type { BalanceGroup } from "@/components/accounts/types";
import type { CurrentBrokerageAccount } from "@/lib/brokerage/balances";
import {
  portfolioAssetSummary,
  type PortfolioAssetSummary,
} from "@/lib/portfolio/asset-totals";
import type { BalancesResult } from "@/lib/portfolio/types";

/**
 * Display-ready balances for an account details view: the normalized groups a
 * {@link BalanceGroup} table renders, the summary the allocations strip reads,
 * plus any sync error and empty-state copy. Every provider maps its raw
 * balances into this one shape so {@link AccountDetailsView} needs no
 * source-specific accessors.
 */
export type BalancesView = {
  groups: BalanceGroup[];
  summary: PortfolioAssetSummary;
  error: string | null;
  emptyMessage?: string;
};

/**
 * Shape on-chain / exchange balance results (wallets, Kraken) into a
 * {@link BalancesView}. Both speak {@link BalancesResult}, so they share one
 * shaper; per-source status copy already rides inside the groups.
 */
export function investmentBalancesView(
  results: BalancesResult[],
): BalancesView {
  return {
    groups: balancesResultsToGroups(results),
    summary: portfolioAssetSummary(results),
    error: null,
  };
}

// Brokerage holdings have no chain, so tag them "brokerage" and reuse the
// portfolio summary machinery, which speaks in BalancesResult.
function brokerageAccountsToBalancesResults(
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

/** The first non-empty sync error across a user's brokerage accounts, if any. */
export function brokerageAccountsSyncError(
  accounts: CurrentBrokerageAccount[],
): string | null {
  return (
    accounts
      .filter((account) => account.syncStatus === "error")
      .map((account) => account.syncErrorMessage?.trim())
      .find((message): message is string => Boolean(message)) ?? null
  );
}

/** Shape brokerage accounts into a {@link BalancesView}. */
export function brokerageBalancesView(
  accounts: CurrentBrokerageAccount[],
): BalancesView {
  return {
    groups: brokerageAccountsToGroups(accounts),
    summary: portfolioAssetSummary(brokerageAccountsToBalancesResults(accounts)),
    error: brokerageAccountsSyncError(accounts),
    emptyMessage:
      accounts.length === 0
        ? "No brokerage linked yet. Connect an account to load balances."
        : undefined,
  };
}
