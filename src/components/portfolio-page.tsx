"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { loadPortfolioPageData } from "@/app/actions";
import { AccountsSection } from "@/components/accounts-section";
import { PortfolioOverviewPage } from "@/components/portfolio-overview-page";
import { Button } from "@/components/ui/button";
import type { AggregateAssetRow } from "@/lib/balance-sheet/aggregate-assets";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";
import type { ManualBalanceItemRow } from "@/lib/manual-balance/items";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { cn } from "@/lib/utils";

export type PortfolioPageData = {
  portfolioSummary: PortfolioAssetSummary;
  balanceSheet: {
    accounts: DepositoryAccountRow[];
    creditCardAccounts: CreditCardAccountRow[];
    manualItems: ManualBalanceItemRow[];
    aggregateAssetRows: AggregateAssetRow[];
  };
};

export function PortfolioPage({
  initialData,
}: {
  initialData: PortfolioPageData;
}) {
  const [summary, setSummary] = useState<PortfolioAssetSummary>(
    initialData.portfolioSummary,
  );
  const [accounts, setAccounts] = useState<DepositoryAccountRow[]>(
    initialData.balanceSheet.accounts,
  );
  const [creditCardAccounts, setCreditCardAccounts] = useState<
    CreditCardAccountRow[]
  >(initialData.balanceSheet.creditCardAccounts);
  const [manualItems, setManualItems] = useState<ManualBalanceItemRow[]>(
    initialData.balanceSheet.manualItems,
  );
  const [aggregateAssetRows, setAggregateAssetRows] = useState<
    AggregateAssetRow[]
  >(initialData.balanceSheet.aggregateAssetRows);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    setAccountsError(null);
    startTransition(async () => {
      const id = toast.loading("Syncing portfolio...");
      try {
        const data = await loadPortfolioPageData();
        setSummary(data.portfolioSummary);
        setAccounts(data.balanceSheet.accounts);
        setCreditCardAccounts(data.balanceSheet.creditCardAccounts);
        setManualItems(data.balanceSheet.manualItems);
        setAggregateAssetRows(data.balanceSheet.aggregateAssetRows);
        toast.success("Portfolio updated", { id });
      } catch {
        toast.error("Couldn't refresh portfolio", { id });
      }
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Portfolio Overview</h1>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={isPending}
          aria-label="Refresh portfolio"
        >
          <RiRefreshLine className={cn(isPending && "animate-spin")} />
        </Button>
      </div>

      <PortfolioOverviewPage summary={summary} busy={isPending} />

      <AccountsSection
        accounts={accounts}
        creditCardAccounts={creditCardAccounts}
        manualItems={manualItems}
        aggregateAssetRows={aggregateAssetRows}
        error={accountsError}
        busy={isPending}
        onAccountsChange={setAccounts}
        onCreditCardAccountsChange={setCreditCardAccounts}
        onManualItemsChange={setManualItems}
        onError={setAccountsError}
      />
    </div>
  );
}
