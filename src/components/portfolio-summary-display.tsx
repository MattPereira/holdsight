"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useState, useTransition } from "react";
import { loadPortfolioSummary } from "@/app/actions";
import { HoldingsSummary } from "@/components/holdings-summary";
import { PortfolioOverviewSheet } from "@/components/portfolio-overview-sheet";
import { Button } from "@/components/ui/button";
import type {
  AssetGroup,
  PortfolioAssetSummary,
} from "@/lib/portfolio/asset-totals";

export function PortfolioSummaryDisplay({
  initialSummary,
  initialGroups,
}: {
  initialSummary: PortfolioAssetSummary;
  initialGroups: AssetGroup[];
}) {
  const [summary, setSummary] = useState<PortfolioAssetSummary>(initialSummary);
  const [groups, setGroups] = useState<AssetGroup[]>(initialGroups);
  const [isPending, startTransition] = useTransition();

  function handleLoad() {
    startTransition(async () => {
      const data = await loadPortfolioSummary();
      setSummary(data);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Portfolio Overview</h1>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleLoad}
          disabled={isPending}
          aria-label="Refresh portfolio summary"
        >
          <RiRefreshLine />
        </Button>
        <PortfolioOverviewSheet
          groups={groups}
          availableSymbols={summary.totals.map((total) => total.symbol)}
          onGroupsChange={setGroups}
        />
      </div>

      <HoldingsSummary
        grandTotalValue={summary.grandTotalValue}
        totals={summary.totals}
        groups={groups}
      />
    </div>
  );
}
