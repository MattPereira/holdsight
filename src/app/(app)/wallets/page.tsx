import {
  loadWalletBalances,
  loadWalletTransactions,
  pollWalletTransactions,
} from "@/app/(app)/wallets/actions";
import { AccountDetailsView } from "@/components/accounts/account-details-view";
import { WALLET_SECONDARY_COLUMN } from "@/components/accounts/balances/groups";
import { investmentBalancesView } from "@/lib/accounts/balances-view";
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
      <AccountDetailsView
        title="Wallets"
        secondaryColumn={WALLET_SECONDARY_COLUMN}
        initialBalances={investmentBalancesView(balanceResults)}
        refreshBalancesAction={loadWalletBalances}
        transactions={{
          initial: {
            transactions: transactionsSnapshot.transactions,
            message: "",
            error: null,
            historyStatus: toWalletTransactionHistoryStatus(transactionsSnapshot),
          },
          refreshAction: loadWalletTransactions,
          pollAction: pollWalletTransactions,
        }}
      />
    </div>
  );
}
