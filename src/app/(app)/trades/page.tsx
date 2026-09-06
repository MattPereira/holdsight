import { TradesPage } from "@/components/trades/trades-page";
import { authorizedViewedAccountId } from "@/lib/auth/authorize";
import {
  emptyPortfolioTransactionsSnapshot,
  getCurrentPortfolioTransactions,
} from "@/lib/portfolio/transactions";

export default async function Trades() {
  const userId = await authorizedViewedAccountId("read");
  const snapshot = userId
    ? await getCurrentPortfolioTransactions(userId)
    : emptyPortfolioTransactionsSnapshot();

  return (
    <TradesPage
      initialData={{
        transactions: snapshot.transactions,
        transactionHistoryStatus: snapshot.historyStatus,
      }}
    />
  );
}
