import { PortfolioOverviewPage } from "@/components/portfolio-overview-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { portfolioAssetSummary } from "@/lib/portfolio/asset-totals";
import { getUserAssetGroups } from "@/lib/portfolio/groups";
import { getCurrentPortfolioBalances } from "@/lib/portfolio/balances";

export default async function Home() {
  const userId = await getCurrentUserId();
  const [summary, groups] = userId
    ? await Promise.all([
        getCurrentPortfolioBalances(userId).then(
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
