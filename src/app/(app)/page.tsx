import { PortfolioOverviewPage } from "@/components/portfolio-overview-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { getCurrentPortfolioBalances } from "@/lib/portfolio/balances";

export default async function Home() {
  const userId = await getCurrentUserId();
  const summary = userId
    ? await getCurrentPortfolioBalances(userId).then(portfolioAssetSummary)
    : portfolioAssetSummary([]);

  return (
    <div className="flex flex-col gap-5">
      <PortfolioOverviewPage initialSummary={summary} />
    </div>
  );
}
