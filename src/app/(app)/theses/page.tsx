import { AssetGroupsEditor } from "@/components/portfolio/asset-groups-editor";
import { getCurrentUserId } from "@/lib/auth/session";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { getCurrentPortfolioBalanceSnapshot } from "@/lib/portfolio/balances";

export default async function ThesesPage() {
  const userId = await getCurrentUserId();
  const allSymbols = userId
    ? portfolioAssetSummary(
        (await getCurrentPortfolioBalanceSnapshot(userId)).portfolioResults,
      ).totals.map((total) => total.symbol)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Theses</h1>
        <p className="text-sm text-muted-foreground">
          Group your assets and record the thesis behind each position.
        </p>
      </div>
      <AssetGroupsEditor allSymbols={allSymbols} />
    </div>
  );
}
