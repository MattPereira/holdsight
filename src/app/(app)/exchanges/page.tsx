import {
  loadKrakenBalances,
  loadKrakenTransactions,
  pollKrakenTransactions,
} from "@/app/(app)/exchanges/actions";
import { AccountDetailsView } from "@/components/accounts/account-details-view";
import { WALLET_SECONDARY_COLUMN } from "@/components/accounts/balances/groups";
import { investmentBalancesView } from "@/lib/accounts/balances-view";
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
      : {
          earliestTransactionAt: null,
          latestTransactionAt: null,
          hasMore: false,
          phase: "up_to_date" as const,
        },
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AccountDetailsView
        title="Exchanges"
        secondaryColumn={WALLET_SECONDARY_COLUMN}
        initialBalances={investmentBalancesView(balanceResults)}
        refreshBalancesAction={loadKrakenBalances}
        transactions={{
          initial: { transactions, message: "", error: null, historyStatus },
          refreshAction: loadKrakenTransactions,
          pollAction: pollKrakenTransactions,
        }}
      />
    </div>
  );
}
