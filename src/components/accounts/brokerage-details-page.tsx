"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useMemo, useState, useTransition } from "react";

import { loadBrokerageBalances } from "@/app/actions";
import { BrokerageDetailsTable } from "@/components/accounts/brokerage-details-table";
import { PortfolioAllocations } from "@/components/portfolio/portfolio-allocations";
import { useAssetGroups } from "@/components/portfolio/asset-groups-context";
import { Button } from "@/components/ui/button";
import type { CurrentBrokerageAccount } from "@/lib/brokerage/balances";
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

export function BrokerageDetailsPage({
  initialAccounts,
}: {
  initialAccounts: CurrentBrokerageAccount[];
}) {
  const [accounts, setAccounts] =
    useState<CurrentBrokerageAccount[]>(initialAccounts);
  const [syncedInitialAccounts, setSyncedInitialAccounts] =
    useState(initialAccounts);
  const { groups } = useAssetGroups();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (syncedInitialAccounts !== initialAccounts) {
    setSyncedInitialAccounts(initialAccounts);
    setAccounts(initialAccounts);
    setError(null);
  }

  const summary = useMemo(
    () => portfolioAssetSummary(toBalancesResults(accounts)),
    [accounts],
  );

  const syncError = useMemo(() => accountSyncError(accounts), [accounts]);
  const displayedError = error ?? syncError;
  const accountsWithHoldings = useMemo(
    () => accounts.filter((account) => account.balances.length > 0),
    [accounts],
  );
  const visibleAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.balances.length > 0 || account.syncStatus === "error",
      ),
    [accounts],
  );
  const hasHoldings = accountsWithHoldings.length > 0;
  const busy = isPending;

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await loadBrokerageBalances();
      setAccounts(result.accounts);
      setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Brokerages</h1>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={busy}
          aria-label={
            accounts.length > 0 ? "Refresh Brokerage" : "Load Brokerage"
          }
        >
          <RiRefreshLine />
        </Button>
      </div>

      {displayedError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {displayedError}
        </p>
      )}

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No brokerage linked yet. Connect an account to load balances.
        </p>
      ) : (
        <div className="flex flex-col gap-6 md:gap-0">
          {hasHoldings && (
            <PortfolioAllocations
              grandTotalValue={summary.grandTotalValue}
              totals={summary.totals}
              groups={groups}
            />
          )}

          <div className="flex flex-col gap-6">
            {visibleAccounts.map((account) => (
              <BrokerageDetailsTable key={account.id} account={account} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
