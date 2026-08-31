import { PlansEditor } from "@/components/portfolio/plans-editor";
import { getCurrentUserId } from "@/lib/auth/session";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { getCurrentPortfolioBalanceSnapshot } from "@/lib/portfolio/balances";

export default async function PlansPage() {
  const userId = await getCurrentUserId();
  const portfolioSummary = userId
    ? portfolioAssetSummary(
        (await getCurrentPortfolioBalanceSnapshot(userId)).portfolioResults,
      )
    : { grandTotalValue: 0, totals: [] };
  return <PlansEditor portfolioSummary={portfolioSummary} />;
}
