import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import {
  emptyPortfolioBalancesPageData,
  getPortfolioBalancesPageData,
} from "@/lib/portfolio/page-data";

export default async function Home() {
  const userId = await authorizedViewedAccountId("read");
  const data = userId
    ? await getPortfolioBalancesPageData(userId)
    : emptyPortfolioBalancesPageData();

  return (
    <PortfolioPage
      initialData={{
        portfolioSummary: data.portfolioSummary,
      }}
    />
  );
}
