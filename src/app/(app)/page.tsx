import { PortfolioSummaryDisplay } from "@/components/portfolio-summary-display";
import { getCurrentUserId } from "@/lib/auth/session";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { getLatestPortfolioPositionSnapshots } from "@/lib/portfolio/snapshots";

export default async function Home() {
  const userId = await getCurrentUserId();
  const summary = userId
    ? portfolioAssetSummary(await getLatestPortfolioPositionSnapshots(userId))
    : portfolioAssetSummary([]);

  return (
    <div className="flex flex-col gap-5">
      <PortfolioSummaryDisplay initialSummary={summary} />
    </div>
  );
}
