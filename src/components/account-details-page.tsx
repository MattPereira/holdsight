"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useMemo, useState, useTransition } from "react";
import { loadEvmPositions, loadHyperCorePositions } from "@/app/actions";
import { AccountDetailsTable } from "@/components/account-details-table";
import { PortfolioAllocations } from "@/components/portfolio-allocations";
import { Button } from "@/components/ui/button";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import type { PositionsResult } from "@/lib/portfolio/types";

/* ------------------------------ container ------------------------------ */

export function AccountDetailsPage({
  initialResults,
  source,
  title,
  headerAction,
}: {
  initialResults: PositionsResult[];
  source: "evm" | "hypercore";
  title: string;
  headerAction?: React.ReactNode;
}) {
  const [results, setResults] = useState<PositionsResult[]>(initialResults);
  const [isPending, startTransition] = useTransition();
  const summary = useMemo(() => portfolioAssetSummary(results), [results]);

  function handleLoad() {
    startTransition(async () => {
      const data =
        source === "evm"
          ? await loadEvmPositions()
          : await loadHyperCorePositions();
      setResults(data);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleLoad}
          disabled={isPending}
          aria-label={results.length > 0 ? `Refresh ${title}` : `Load ${title}`}
        >
          <RiRefreshLine />
        </Button>
        {headerAction}
      </div>

      {results.length > 0 && (
        <div className="flex flex-col gap-4">
          <PortfolioAllocations
            grandTotalValue={summary.grandTotalValue}
            totals={summary.totals}
          />

          <div className="flex flex-col gap-6">
            {results.map((result) => (
              <AccountDetailsTable key={result.address} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
