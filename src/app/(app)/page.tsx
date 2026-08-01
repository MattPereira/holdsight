import { HomeJournal } from "@/components/journal/home-journal";
import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getCurrentJournalSlots } from "@/lib/journal/investment-entry";
import {
  emptyPortfolioBalancesPageData,
  getPortfolioBalancesPageData,
} from "@/lib/portfolio/page-data";

export default async function Home() {
  const userId = await getCurrentUserId();
  const [data, journal] = userId
    ? await Promise.all([
        getPortfolioBalancesPageData(userId),
        getCurrentJournalSlots(userId, ["daily", "weekly"]),
      ])
    : [emptyPortfolioBalancesPageData(), null];

  return (
    <PortfolioPage
      initialData={{
        portfolioSummary: data.portfolioSummary,
      }}
      journalSection={
        journal ? (
          <HomeJournal
            homeTimezone={journal.homeTimezone}
            slots={journal.slots}
          />
        ) : null
      }
    />
  );
}
