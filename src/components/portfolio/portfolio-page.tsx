"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { loadPortfolioPageData } from "@/app/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { PortfolioAccountsList } from "@/components/portfolio/portfolio-accounts-list";
import { useAssetGroups } from "@/components/portfolio/asset-groups-context";
import { PortfolioAllocations } from "@/components/portfolio/portfolio-allocations";
import type { CreditCardAccountRow } from "@/lib/credit-card/accounts";
import type { DepositoryAccountRow } from "@/lib/depository/accounts";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Portfolio"
        onRefresh={handleRefresh}
        refreshBusy={isPending}
        refreshLabel="Refresh"
        refreshBusyLabel="Refreshing"
      />

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
    </div>
  );
}
