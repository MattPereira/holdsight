import { PortfolioPage } from "@/components/portfolio-page";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  emptyHomeBalanceData,
  getCurrentHomeBalanceData,
} from "@/lib/balance-sheet/data";

export default async function Home() {
  const userId = await getCurrentUserId();
  const data = userId
    ? await getCurrentHomeBalanceData(userId)
    : emptyHomeBalanceData();

  return (
    <PortfolioPage
      initialData={{
        portfolioSummary: data.portfolioSummary,
        balanceSheet: data.balanceSheet,
      }}
    />
  );
}
