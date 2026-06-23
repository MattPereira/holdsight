"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useState } from "react";

import { BalancesTabContent } from "@/components/accounts/balances/balances-tab-content";
import type { TransactionsPanel } from "@/components/accounts/transactions/types";
import { TransactionsTabContent } from "@/components/accounts/transactions/transactions-tab-content";
import type {
  BalanceGroup,
  SecondaryColumn,
} from "@/components/accounts/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";

/**
 * Presentational chrome shared by every account details page: title, an error
 * banner, the Balances/Transactions tabs, a per-tab refresh button, the
 * allocations summary, and the normalized balance groups. Each page maps its
 * own data into {@link BalanceGroup}s and wires its own refresh handlers; this
 * component owns no source-specific logic.
 *
 * The Transactions tab only appears when a {@link TransactionsPanel} is
 * supplied, so sources that don't yet have transactions render balances alone.
 */
export function AccountDetailsShell({
  title,
  groups,
  secondaryColumn,
  summary,
  onRefreshBalances,
  balancesBusy,
  balancesError,
  transactions,
  emptyMessage,
}: {
  title: string;
  groups: BalanceGroup[];
  secondaryColumn: SecondaryColumn;
  summary: PortfolioAssetSummary;
  onRefreshBalances: () => void;
  balancesBusy: boolean;
  balancesError?: string | null;
  transactions?: TransactionsPanel;
  emptyMessage?: string;
}) {
  const [activeTab, setActiveTab] = useState("balances");

  const hasTransactions = transactions !== undefined;
  const onTransactionsTab = activeTab === "transactions" && hasTransactions;

  const refresh = onTransactionsTab
    ? transactions.onRefresh
    : onRefreshBalances;
  const refreshBusy = onTransactionsTab ? transactions.busy : balancesBusy;

  return (
    <div className="flex flex-col gap-4">
      {balancesError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {balancesError}
        </p>
      ) : null}

      {groups.length === 0 && emptyMessage ? (
        <>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        </>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col gap-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">{title}</h1>

              {hasTransactions ? (
                <TabsList>
                  <TabsTrigger value="balances">Balances</TabsTrigger>
                  <TabsTrigger value="transactions">Transactions</TabsTrigger>
                </TabsList>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={refresh}
                disabled={refreshBusy}
                aria-label={
                  onTransactionsTab
                    ? refreshBusy
                      ? "Syncing"
                      : "Sync"
                    : refreshBusy
                      ? "Refreshing"
                      : "Refresh"
                }
              >
                <RiRefreshLine />
              </Button>
            </div>
          </div>

          <TabsContent value="balances">
            <BalancesTabContent
              groups={groups}
              secondaryColumn={secondaryColumn}
              summary={summary}
            />
          </TabsContent>

          {hasTransactions ? (
            <TabsContent value="transactions">
              <TransactionsTabContent panel={transactions} />
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </div>
  );
}
