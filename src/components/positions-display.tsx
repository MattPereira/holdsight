"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useMemo, useState, useTransition } from "react";
import { loadEvmPositions, loadHyperCorePositions } from "@/app/actions";
import {
  formatUsd,
  HoldingsRows,
  HoldingsSummary,
  type HoldingsDisplayRow,
} from "@/components/holdings-summary";
import { Button } from "@/components/ui/button";
import {
  portfolioAssetSummary,
  walletTotal,
} from "@/lib/portfolio/asset-totals";
import type { Position, PositionsResult } from "@/lib/portfolio/types";

function shortenAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function statusMessage(result: PositionsResult): string {
  switch (result.status) {
    case "indexing":
      return "Indexing...";
    case "rate_limited":
      return "Rate limited. Wait a moment before reloading.";
    case "error":
      return result.message;
    case "ready":
      return "No positions.";
  }
}

function positionKey(position: Position, i: number): string {
  return position.sourcePositionId ?? `${position.symbol}-${position.chainId}-${i}`;
}

/* ------------------------------- wallet -------------------------------- */

function positionRows(positions: Position[]): HoldingsDisplayRow[] {
  return positions.map((position, i) => ({
    key: positionKey(position, i),
    symbol: position.symbol,
    priceUsd: position.priceUsd,
    amount: position.amount,
    valueUsd: position.valueUsd,
    detail: position.chainId,
  }));
}

function WalletSection({ result }: { result: PositionsResult }) {
  const hasPositions =
    result.status === "ready" && result.positions.length > 0;
  const total = walletTotal(result);

  if (result.status === "ready" && result.positions.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 px-2">
        <span className="font-mono text-sm font-medium">
          {shortenAddress(result.address)}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {formatUsd(total)}
        </span>
      </div>
      {hasPositions ? (
        <HoldingsRows
          rows={positionRows(result.positions)}
          totalValue={total}
          mobileVariant="positions"
        />
      ) : (
        <p className="text-sm text-muted-foreground">{statusMessage(result)}</p>
      )}
    </section>
  );
}

/* ------------------------------ container ------------------------------ */

export function PositionsDisplay({
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
        source === "evm" ? await loadEvmPositions() : await loadHyperCorePositions();
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
          <HoldingsSummary
            grandTotalValue={summary.grandTotalValue}
            totals={summary.totals}
          />

          <div className="flex flex-col gap-6">
            {results.map((result) => (
              <WalletSection key={result.address} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
