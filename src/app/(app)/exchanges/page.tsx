import { ExchangesDetailsPage } from "@/components/accounts/exchanges-details-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserKrakenAccounts } from "@/lib/exchange/kraken/accounts";
import { getCurrentKrakenBalances } from "@/lib/exchange/kraken/balances";
import {
  getCurrentKrakenTransactions,
  getKrakenTransactionHistoryStatus,
} from "@/lib/exchange/kraken/transactions";

export default async function ExchangePage() {
  const userId = await getCurrentUserId();
  const krakenAccounts = userId ? await getUserKrakenAccounts(userId) : [];
  const [balanceResults, transactions, historyStatus] = await Promise.all([
    getCurrentKrakenBalances(krakenAccounts),
    userId ? getCurrentKrakenTransactions(userId) : [],
    userId
      ? getKrakenTransactionHistoryStatus(userId)
      : { earliestTransactionAt: null, latestTransactionAt: null, hasMore: false, phase: "up_to_date" as const },
  ]);
  const balanceResultsKey = balanceResults
    .map((result) =>
      result.status === "ready"
        ? `${result.address}:${result.balances.length}:${result.balances.reduce(
            (sum, balance) => sum + balance.valueUsd,
            0,
          )}`
        : `${result.address}:${result.status}`,
    )
    .join("|");

  return (
    <div className="flex flex-col gap-6">
      <ExchangesDetailsPage
        key={balanceResultsKey}
        initialResults={balanceResults}
        initialTransactions={transactions}
        initialHistoryStatus={historyStatus}
      />
    </div>
  );
}
