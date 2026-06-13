"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useState, useTransition } from "react";
import { loadPortfolioSummary } from "@/app/actions";
import { PortfolioAllocations } from "@/components/portfolio-allocations";
import { PortfolioAllocationsSettings } from "@/components/portfolio-allocations-settings";
import {
  usePortfolioSettings,
  usePublishAvailableSymbols,
} from "@/components/portfolio-settings-context";
import { Button } from "@/components/ui/button";
import type { PortfolioAssetSummary } from "@/lib/portfolio/asset-totals";

export function PortfolioOverviewPage({
  initialSummary,
}: {
  initialSummary: PortfolioAssetSummary;
}) {
  const [summary, setSummary] = useState<PortfolioAssetSummary>(initialSummary);
  const { groups } = usePortfolioSettings();
  const [isPending, startTransition] = useTransition();

  usePublishAvailableSymbols(summary.totals.map((total) => total.symbol));

  function handleLoad() {
    startTransition(async () => {
      const data = await loadPortfolioSummary();
      setSummary(data);
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
          <RiRefreshLine />
        </Button>
        <PortfolioAllocationsSettings />
      </div>

      <PortfolioAllocations
        grandTotalValue={summary.grandTotalValue}
        totals={summary.totals}
        groups={groups}
      />
    </div>
  );
}
