"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { loadAccountsPageData } from "@/app/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { PortfolioAccountsList } from "@/components/portfolio/portfolio-accounts-list";
import type { PortfolioAccountsData } from "@/lib/portfolio/page-data";
import { cn } from "@/lib/utils";

export function AccountsPage({
  initialData,
}: {
  initialData: PortfolioAccountsData;
}) {
  const [accounts, setAccounts] = useState(initialData.accounts);
  const [creditCardAccounts, setCreditCardAccounts] = useState(
    initialData.creditCardAccounts,
  );
  const [manualItems, setManualItems] = useState(initialData.manualItems);
  const [investmentAccountSections, setInvestmentAccountSections] = useState(
    initialData.investmentAccountSections,
  );
  const [isPending, startTransition] = useTransition();

  // Re-seed local state whenever the server sends fresh data — e.g. after the
  // global "Manage accounts" sheet calls router.refresh(). Adjusting state
  // during render (React's recommended pattern) keeps the page in sync with the
  // server without an effect.
  const [syncedData, setSyncedData] = useState(initialData);
  if (syncedData !== initialData) {
    setSyncedData(initialData);
    setAccounts(initialData.accounts);
    setCreditCardAccounts(initialData.creditCardAccounts);
    setManualItems(initialData.manualItems);
    setInvestmentAccountSections(initialData.investmentAccountSections);
  }

  function handleRefresh() {
    startTransition(async () => {
      const id = toast.loading("Syncing accounts...");
      try {
        const data = await loadAccountsPageData();
        setAccounts(data.accounts);
        setCreditCardAccounts(data.creditCardAccounts);
        setManualItems(data.manualItems);
        setInvestmentAccountSections(data.investmentAccountSections);
        toast.success("Accounts updated", { id });
      } catch {
        toast.error("Couldn't refresh accounts", { id });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        onRefresh={handleRefresh}
        refreshBusy={isPending}
        refreshLabel="Refresh"
        refreshBusyLabel="Refreshing"
      />

      <div
        aria-busy={isPending}
        className={cn(
          "transition-opacity duration-200",
          isPending && "pointer-events-none opacity-60",
        )}
      >
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
