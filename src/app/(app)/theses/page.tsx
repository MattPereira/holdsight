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

  return <AssetGroupsEditor allSymbols={allSymbols} />;
}
