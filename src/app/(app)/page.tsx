import { PortfolioOverviewPage } from "@/components/portfolio-overview-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { getUserAssetGroups } from "@/lib/portfolio/groups";
import { getCurrentPortfolioPositions } from "@/lib/portfolio/positions";

export default async function Home() {
  const userId = await getCurrentUserId();
  const [summary, groups] = userId
    ? await Promise.all([
        getCurrentPortfolioPositions(userId).then(
          portfolioAssetSummary,
        ),
        getUserAssetGroups(userId),
      ])
    : [portfolioAssetSummary([]), []];

  return (
    <div className="flex flex-col gap-5">
      <PortfolioOverviewPage initialSummary={summary} initialGroups={groups} />
    </div>
  );
}
