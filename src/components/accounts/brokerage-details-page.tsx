"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useMemo, useState, useTransition } from "react";

import {
  loadBrokerageBalances,
  loadBrokerageTransactions,
} from "@/app/actions";
import { BrokerageDetailsTable } from "@/components/accounts/brokerage-details-table";
import { PortfolioAllocations } from "@/components/portfolio/portfolio-allocations";
import { useAssetGroups } from "@/components/portfolio/asset-groups-context";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionMessage, setTransactionMessage] = useState<string | null>(
    null,
  );
  const [isBalancePending, startBalanceTransition] = useTransition();
  const [isTransactionPending, startTransactionTransition] = useTransition();

  if (syncedInitialAccounts !== initialAccounts) {
    setSyncedInitialAccounts(initialAccounts);
    setAccounts(initialAccounts);
    setError(null);
    setTransactionError(null);
    setTransactionMessage(null);
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
  const balanceBusy = isBalancePending;
  const transactionBusy = isTransactionPending;
  const [activeTab, setActiveTab] = useState("balances");

  function handleRefresh() {
    setError(null);
    startBalanceTransition(async () => {
      const result = await loadBrokerageBalances();
      setAccounts(result.accounts);
      setError(result.error);
    });
  }

  function handleTransactionRefresh() {
    setTransactionError(null);
    setTransactionMessage(null);
    startTransactionTransition(async () => {
      const result = await loadBrokerageTransactions();
      setTransactionMessage(result.message || null);
      setTransactionError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Brokerages</h1>

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
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col gap-4"
        >
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="balances">Balances</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>

            {activeTab === "balances" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={balanceBusy}
              >
                <RiRefreshLine />
                {balanceBusy ? "Refreshing" : "Refresh"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTransactionRefresh}
                disabled={transactionBusy}
              >
                <RiRefreshLine />
                {transactionBusy ? "Refreshing" : "Refresh"}
              </Button>
            )}
          </div>

          <TabsContent value="balances">
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
          </TabsContent>

          <TabsContent value="transactions">
            <div className="flex flex-col gap-4">
              {transactionError ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {transactionError}
                </p>
              ) : null}

              {transactionMessage ? (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {transactionMessage}
                </p>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
