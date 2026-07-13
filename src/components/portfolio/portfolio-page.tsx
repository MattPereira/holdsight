"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  loadPortfolioPageData,
  loadPortfolioTransactions,
  pollPortfolioTransactions,
  type PortfolioTransactionsActionResult,
} from "@/app/actions";
import { PortfolioAccountsList } from "@/components/portfolio/portfolio-accounts-list";
import { useAssetGroups } from "@/components/portfolio/asset-groups-context";
import { PortfolioAllocations } from "@/components/portfolio/portfolio-allocations";
import type { TransactionHistoryStatus } from "@/components/accounts/transactions/types";
import { TransactionsTabContent } from "@/components/accounts/transactions/transactions-tab-content";
import { useTransactionsPanel } from "@/components/accounts/transactions/use-transactions-panel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import type { ManualBalanceItemRow } from "@/lib/manual-balance/items";
import type { InvestmentAccountSection } from "@/lib/portfolio/account-asset-rows";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { cn } from "@/lib/utils";

export type PortfolioPageData = {
  portfolioSummary: PortfolioAssetSummary;
  accountData: {
    accounts: DepositoryAccountRow[];
    creditCardAccounts: CreditCardAccountRow[];
    manualItems: ManualBalanceItemRow[];
    investmentAccountSections: InvestmentAccountSection[];
  };
  transactions: InvestmentTransactionListItem[];
  transactionHistoryStatus: TransactionHistoryStatus;
};

export function PortfolioPage({
  initialData,
}: {
  initialData: PortfolioPageData;
}) {
  const { groups } = useAssetGroups();
  const [summary, setSummary] = useState<PortfolioAssetSummary>(
    initialData.portfolioSummary,
  );
  const [accounts, setAccounts] = useState<DepositoryAccountRow[]>(
    initialData.accountData.accounts,
  );
  const [creditCardAccounts, setCreditCardAccounts] = useState<
    CreditCardAccountRow[]
  >(initialData.accountData.creditCardAccounts);
  const [manualItems, setManualItems] = useState<ManualBalanceItemRow[]>(
    initialData.accountData.manualItems,
  );
  const [investmentAccountSections, setInvestmentAccountSections] = useState<
    InvestmentAccountSection[]
  >(initialData.accountData.investmentAccountSections);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState("balances");

  // Re-seed local state whenever the server sends fresh data — e.g. after the
  // global "Manage accounts" sheet calls router.refresh(). Adjusting state
  // during render (React's recommended pattern) keeps the page in sync with the
  // server without an effect.
  const [syncedData, setSyncedData] = useState(initialData);
  if (syncedData !== initialData) {
    setSyncedData(initialData);
    setSummary(initialData.portfolioSummary);
    setAccounts(initialData.accountData.accounts);
    setCreditCardAccounts(initialData.accountData.creditCardAccounts);
    setManualItems(initialData.accountData.manualItems);
    setInvestmentAccountSections(
      initialData.accountData.investmentAccountSections,
    );
  }

  const transactionsConfig = useMemo(
    () => ({
      initialTransactions: initialData.transactions,
      loadTransactions: loadPortfolioTransactions,
      pollTransactions: pollPortfolioTransactions,
      getTransactions: (result: PortfolioTransactionsActionResult) =>
        result.transactions,
      getError: (result: PortfolioTransactionsActionResult) => result.error,
      getMessage: (result: PortfolioTransactionsActionResult) =>
        result.message || null,
      initialHistoryStatus: initialData.transactionHistoryStatus,
      getHistoryStatus: (result: PortfolioTransactionsActionResult) =>
        result.historyStatus,
      initialIsSyncing: initialData.transactionHistoryStatus.hasMore,
      getIsSyncing: (result: PortfolioTransactionsActionResult) =>
        result.isSyncing,
    }),
    [initialData.transactions, initialData.transactionHistoryStatus],
  );

  const transactionsPanel = useTransactionsPanel(transactionsConfig);

  function handleRefresh() {
    startTransition(async () => {
      const id = toast.loading("Syncing portfolio...");
      try {
        const data = await loadPortfolioPageData();
        setSummary(data.portfolioSummary);
        setAccounts(data.accountData.accounts);
        setCreditCardAccounts(data.accountData.creditCardAccounts);
        setManualItems(data.accountData.manualItems);
        setInvestmentAccountSections(
          data.accountData.investmentAccountSections,
        );
        toast.success("Portfolio updated", { id });
      } catch {
        toast.error("Couldn't refresh portfolio", { id });
      }
    });
  }

  const onTransactionsTab = activeTab === "transactions";
  const refresh = onTransactionsTab
    ? transactionsPanel?.onRefresh
    : handleRefresh;
  const refreshBusy = onTransactionsTab
    ? (transactionsPanel?.refreshPending ?? false)
    : isPending;

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex flex-col gap-6"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Portfolio</h1>

          <TabsList>
            <TabsTrigger value="balances" className="w-24">
              Balances
            </TabsTrigger>
            <TabsTrigger value="transactions" className="w-24">
              Trades
            </TabsTrigger>
          </TabsList>
        </div>

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
          <RiRefreshLine className={cn(refreshBusy && "animate-spin")} />
        </Button>
      </div>

      <TabsContent value="balances">
        <div className="flex flex-col gap-10">
          <div
            aria-busy={isPending}
            className={cn(
              "transition-opacity duration-200",
              isPending && "pointer-events-none opacity-60",
            )}
          >
            <PortfolioAllocations
              grandTotalValue={summary.grandTotalValue}
              totals={summary.totals}
              groups={groups}
            />
          </div>

          <PortfolioAccountsList
            accounts={accounts}
            creditCardAccounts={creditCardAccounts}
            manualItems={manualItems}
            investmentAccountSections={investmentAccountSections}
          />
        </div>
      </TabsContent>

      <TabsContent value="transactions">
        {transactionsPanel ? (
          <TransactionsTabContent panel={transactionsPanel} />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
