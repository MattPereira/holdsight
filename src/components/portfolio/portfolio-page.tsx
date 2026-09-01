"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { loadPortfolioPageData } from "@/app/(app)/portfolio/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { usePlans } from "@/components/portfolio/plans-context";
import { PlansEditor } from "@/components/portfolio/plans-editor";
import { PortfolioAllocations } from "@/components/portfolio/portfolio-allocations";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { cn } from "@/lib/utils";

export type PortfolioPageData = {
  portfolioSummary: PortfolioAssetSummary;
};

export function PortfolioPage({
  initialData,
}: {
  initialData: PortfolioPageData;
}) {
  const { plans } = usePlans();
  const [summary, setSummary] = useState<PortfolioAssetSummary>(
    initialData.portfolioSummary,
  );
  const [isPending, startTransition] = useTransition();

  // Re-seed local state whenever the server sends fresh data — e.g. after the
  // global "Manage accounts" sheet calls router.refresh(). Adjusting state
  // during render (React's recommended pattern) keeps the page in sync with the
  // server without an effect.
  const [syncedData, setSyncedData] = useState(initialData);
  if (syncedData !== initialData) {
    setSyncedData(initialData);
    setSummary(initialData.portfolioSummary);
  }

  function handleRefresh() {
    startTransition(async () => {
      const id = toast.loading("Syncing portfolio...");
      try {
        const data = await loadPortfolioPageData();
        setSummary(data.portfolioSummary);
        toast.success("Portfolio updated", { id });
      } catch {
        toast.error("Couldn't refresh portfolio", { id });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
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
            plans={plans}
          />
        </div>

        <PlansEditor portfolioSummary={summary} />
      </div>
    </div>
  );
}
