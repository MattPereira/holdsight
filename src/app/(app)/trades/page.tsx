import { TradesPage } from "@/components/trades/trades-page";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  emptyPortfolioTransactionsSnapshot,
  getCurrentPortfolioTransactions,
} from "@/lib/portfolio/transactions";

export default async function Trades() {
  const userId = await getCurrentUserId();
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
