"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useMemo, useState, useTransition } from "react";

import {
  loadBrokerageBalances,
  removeBrokerage,
} from "@/app/actions";
import { BrokerageDetailsTable } from "@/components/brokerage-details-table";
import { PortfolioAllocations } from "@/components/portfolio-allocations";
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

export function BrokerageDetailsPage({
  initialAccounts,
}: {
  initialAccounts: CurrentBrokerageAccount[];
}) {
  const [accounts, setAccounts] =
    useState<CurrentBrokerageAccount[]>(initialAccounts);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(
    () => portfolioAssetSummary(toBalancesResults(accounts)),
    [accounts],
  );

  const hasHoldings = accounts.some((account) => account.balances.length > 0);
  const busy = isPending;

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await loadBrokerageBalances();
      setAccounts(result.accounts);
      setError(result.error);
    });
  }

  function handleRemove(plaidItemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeBrokerage(plaidItemId);
      setAccounts(result.accounts);
      setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Brokerage</h1>
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No brokerage linked yet. Connect an account to load balances.
        </p>
      ) : (
        <div className="flex flex-col">
          {hasHoldings && (
            <PortfolioAllocations
              grandTotalValue={summary.grandTotalValue}
              totals={summary.totals}
            />
          )}

          <div className="flex flex-col gap-6">
            {accounts.map((account) => (
              <BrokerageDetailsTable
                key={account.id}
                account={account}
                onRemove={handleRemove}
                disabled={busy}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
