import { WalletsDetailsPage } from "@/components/accounts/wallets-details-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { portfolioProviderRegistry } from "@/lib/portfolio/providers/registry";
import { getCurrentWalletBalances } from "@/lib/wallets/balances";
import { toWalletTransactionHistoryStatus } from "@/lib/wallets/transactions";

export default async function WalletsPage() {
  const userId = await getCurrentUserId();
  const [balanceResults, transactionsSnapshot] = userId
    ? await Promise.all([
        getCurrentWalletBalances(userId),
        portfolioProviderRegistry.getWalletTransactions(userId),
      ])
    : [
        [],
        {
          transactions: [],
          historyStatus: {
            earliestTransactionAt: null,
            latestTransactionAt: null,
            latestTransactionUpdatedAt: null,
            hasMore: false,
            phase: "up_to_date" as const,
          },
          isSyncing: false,
        },
      ];

  return (
    <div className="flex flex-col gap-6">
      <WalletsDetailsPage
        initialResults={balanceResults}
        initialTransactions={transactionsSnapshot.transactions}
        initialHistoryStatus={toWalletTransactionHistoryStatus(transactionsSnapshot)}
      />
    </div>
  );
}
