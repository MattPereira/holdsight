"use client";

import { PortfolioAllocations } from "@/components/portfolio-allocations";
import { useAssetGroups } from "@/components/asset-groups-context";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { cn } from "@/lib/utils";

export function PortfolioOverviewPage({
  summary,
  busy = false,
}: {
  summary: PortfolioAssetSummary;
  busy?: boolean;
}) {
  const { groups } = useAssetGroups();

  return (
    <div className="flex flex-col gap-6">
      <div
        aria-busy={busy}
        className={cn(
          "transition-opacity duration-200",
          busy && "pointer-events-none opacity-60",
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
