"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useMemo, useState, useTransition } from "react";
import {
  loadEvmBalances,
  loadHyperCoreBalances,
  loadWalletBalances,
  loadKrakenBalances,
} from "@/app/actions";
import { AccountDetailsTable } from "@/components/account-details-table";
import { PortfolioAllocations } from "@/components/portfolio-allocations";
import { useAssetGroups } from "@/components/asset-groups-context";
import { Button } from "@/components/ui/button";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import type { BalancesResult } from "@/lib/portfolio/types";

/* ------------------------------ container ------------------------------ */

export function AccountDetailsPage({
  initialResults,
  source,
  title,
  headerAction,
}: {
  initialResults: BalancesResult[];
  source: "evm" | "hypercore" | "kraken" | "wallets";
  title: string;
  headerAction?: React.ReactNode;
}) {
  const [results, setResults] = useState<BalancesResult[]>(initialResults);
  const { groups } = useAssetGroups();
  const [isPending, startTransition] = useTransition();
  const summary = useMemo(() => portfolioAssetSummary(results), [results]);

  function handleLoad() {
    startTransition(async () => {
      const data = await (source === "evm"
        ? loadEvmBalances()
        : source === "hypercore"
          ? loadHyperCoreBalances()
          : source === "wallets"
            ? loadWalletBalances()
            : loadKrakenBalances());
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
        <div className="flex flex-col">
          <PortfolioAllocations
            grandTotalValue={summary.grandTotalValue}
            totals={summary.totals}
            groups={groups}
          />

          <div className="flex flex-col gap-6">
            {results.map((result, idx) => (
              <AccountDetailsTable key={idx} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
