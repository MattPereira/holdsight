import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  emptyPortfolioBalancesPageData,
  getPortfolioBalancesPageData,
} from "@/lib/portfolio/page-data";

export default async function Home() {
  const userId = await getCurrentUserId();
  const data = userId
    ? await getPortfolioBalancesPageData(userId)
    : emptyPortfolioBalancesPageData();

  return (
    <PortfolioPage
      initialData={{
        portfolioSummary: data.portfolioSummary,
        accountData: data.accountData,
      }}
    />
  );
}
