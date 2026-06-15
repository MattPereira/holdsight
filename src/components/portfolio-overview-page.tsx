"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { loadPortfolioSummary } from "@/app/actions";
import { PortfolioAllocations } from "@/components/portfolio-allocations";
import { useAssetGroups } from "@/components/asset-groups-context";
import { Button } from "@/components/ui/button";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { cn } from "@/lib/utils";

export function PortfolioOverviewPage({
  initialSummary,
}: {
  initialSummary: PortfolioAssetSummary;
}) {
  const [summary, setSummary] = useState<PortfolioAssetSummary>(initialSummary);
  const { groups } = useAssetGroups();
  const [isPending, startTransition] = useTransition();

  function handleLoad() {
    startTransition(async () => {
      const id = toast.loading("Syncing portfolio…");
      try {
        const data = await loadPortfolioSummary();
        setSummary(data);
        toast.success("Portfolio updated", { id });
      } catch {
        toast.error("Couldn't refresh portfolio", { id });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Net Assets</h1>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleLoad}
          disabled={isPending}
          aria-label="Refresh portfolio summary"
        >
          <RiRefreshLine className={cn(isPending && "animate-spin")} />
        </Button>
      </div>

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
    </div>
  );
}
