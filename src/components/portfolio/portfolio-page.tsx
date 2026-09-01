"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { loadPortfolioPageData } from "@/app/(app)/portfolio/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { usePlans } from "@/components/portfolio/plans-context";
import { PlansEditor } from "@/components/portfolio/plans-editor";
import { PortfolioAllocations } from "@/components/portfolio/portfolio-allocations";
import { TradingPrinciplesPanel } from "@/components/principles/trading-principles-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  // A link into a specific Plan (?plan=...) is a request for the form, so it
  // overrides the principles-first default.
  const hasSelectedPlan = useSearchParams().has("plan");
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

        <Tabs defaultValue={hasSelectedPlan ? "strategy" : "mindset"}>
          <TabsList className="mb-4 group-data-horizontal/tabs:h-11">
            <TabsTrigger value="mindset" className="px-4 text-base">
              Mindset
            </TabsTrigger>
            <TabsTrigger value="strategy" className="px-4 text-base">
              Strategy
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mindset">
            <TradingPrinciplesPanel />
          </TabsContent>
          {/* Force-mounted so switching tabs mid-edit never discards a Plan
              draft or its pending autosave. */}
          <TabsContent
            value="strategy"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <PlansEditor portfolioSummary={summary} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
