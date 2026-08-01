import {
  loadBrokerageBalances,
  loadBrokerageTransactions,
  pollBrokerageTransactions,
} from "@/app/(app)/brokerages/actions";
import { AccountDetailsView } from "@/components/accounts/account-details-view";
import { BROKERAGE_SECONDARY_COLUMN } from "@/components/accounts/balances/groups";
import { brokerageBalancesView } from "@/lib/accounts/balances-view";
import { getCurrentUserId } from "@/lib/auth/session";
import { getCurrentBrokerageBalances } from "@/lib/brokerage/balances";
import {
  getBrokerageTransactionImportStatus,
  getCurrentBrokerageTransactions,
} from "@/lib/brokerage/transactions";

export default async function BrokeragePage() {
  const userId = await getCurrentUserId();
  const [accounts, transactions, transactionImportStatus] = userId
    ? await Promise.all([
        getCurrentBrokerageBalances(userId),
        getCurrentBrokerageTransactions(userId),
        getBrokerageTransactionImportStatus(userId),
      ])
    : [[], [], { isSyncing: false }];

  return (
    <div className="flex flex-col gap-6">
      <AccountDetailsView
        title="Brokerages"
        secondaryColumn={BROKERAGE_SECONDARY_COLUMN}
        initialBalances={brokerageBalancesView(accounts)}
        refreshBalancesAction={loadBrokerageBalances}
        transactions={{
          initial: {
            transactions,
            message: "",
            error: null,
            historyStatus: {
              earliestTransactionAt: null,
              latestTransactionAt: null,
              latestTransactionUpdatedAt: null,
              hasMore: transactionImportStatus.isSyncing,
            },
          },
          refreshAction: loadBrokerageTransactions,
          pollAction: pollBrokerageTransactions,
        }}
      />
    </div>
  );
}
