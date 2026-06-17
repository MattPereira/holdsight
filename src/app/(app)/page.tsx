import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  emptyPortfolioHomeData,
  getCurrentPortfolioHomeData,
} from "@/lib/portfolio/page-data";

export default async function Home() {
  const userId = await getCurrentUserId();
  const data = userId
    ? await getCurrentPortfolioHomeData(userId)
    : emptyPortfolioHomeData();

  return (
    <PortfolioPage
      initialData={{
        portfolioSummary: data.portfolioSummary,
        accountData: data.accountData,
      }}
    />
  );
}
