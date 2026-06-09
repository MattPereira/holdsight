import type { PositionsResult } from "@/lib/portfolio/types";

export type AssetTotal = {
  symbol: string;
  amount: number;
  valueUsd: number;
};

export type PortfolioAssetSummary = {
  grandTotalValue: number;
  totals: AssetTotal[];
};

function totalAssetSymbol(symbol: string): string {
  return symbol.trim();
}

export function walletTotal(result: PositionsResult): number {
  return result.status === "ready"
    ? result.positions.reduce((sum, p) => sum + p.valueUsd, 0)
    : 0;
}

export function grandTotal(results: PositionsResult[]): number {
  return results.reduce((sum, result) => sum + walletTotal(result), 0);
}

export function aggregateAssetTotals(results: PositionsResult[]): AssetTotal[] {
  const totals = new Map<string, AssetTotal>();

  for (const result of results) {
    if (result.status !== "ready") continue;

    for (const position of result.positions) {
      const symbol = totalAssetSymbol(position.symbol);
      const total = totals.get(symbol);

      if (total) {
        total.amount += position.amount;
        total.valueUsd += position.valueUsd;
      } else {
        totals.set(symbol, {
          symbol,
          amount: position.amount,
          valueUsd: position.valueUsd,
        });
      }
    }
  }

  const assetTotals = Array.from(totals.values());

  return assetTotals.sort((a, b) => b.valueUsd - a.valueUsd);
}

export function portfolioAssetSummary(
  results: PositionsResult[],
): PortfolioAssetSummary {
  return {
    grandTotalValue: grandTotal(results),
    totals: aggregateAssetTotals(results),
  };
}
