import { CurrentJournalEntries } from "@/components/journal/current-journal-entries";
import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getCurrentJournalEntries } from "@/lib/journal/investment-entry";
import {
  emptyPortfolioBalancesPageData,
  getPortfolioBalancesPageData,
} from "@/lib/portfolio/page-data";

export default async function Home() {
  const userId = await getCurrentUserId();
  const [data, journalEntries] = userId
    ? await Promise.all([
        getPortfolioBalancesPageData(userId),
        getCurrentJournalEntries(userId),
      ])
    : [emptyPortfolioBalancesPageData(), []];

  return (
    <PortfolioPage
      initialData={{
        portfolioSummary: data.portfolioSummary,
      }}
      journalSection={<CurrentJournalEntries entries={journalEntries} />}
    />
  );
}
