import { WalletsDetailsPage } from "@/components/accounts/wallets-details-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserEvmAccounts } from "@/lib/evm/accounts";
import { ensureUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import {
  getCurrentWalletTransactions,
  getWalletTransactionHistoryStatus,
} from "@/lib/wallets/transactions";
import { getCurrentWalletBalances } from "@/lib/wallets/balances";

export default async function WalletsPage() {
  const userId = await getCurrentUserId();
  const wallets = userId ? await getUserEvmAccounts(userId) : [];
  const hyperCoreAccounts = userId
    ? await ensureUserHyperCoreAccounts(userId, wallets)
    : [];
  const [balanceResults, transactions, historyStatus] = userId
    ? await Promise.all([
        getCurrentWalletBalances(userId, wallets),
        getCurrentWalletTransactions(userId),
        getWalletTransactionHistoryStatus(userId, wallets, hyperCoreAccounts),
      ])
    : [
        [],
        [],
        { transactionCount: 0, earliestTransactionAt: null, latestTransactionAt: null, latestTransactionUpdatedAt: null, hasMore: false, phase: "up_to_date" as const },
      ];

  return (
    <div className="flex flex-col gap-6">
      <WalletsDetailsPage
        initialResults={balanceResults}
        initialTransactions={transactions}
        initialHistoryStatus={historyStatus}
      />
    </div>
  );
}
