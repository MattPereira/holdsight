import { BrokerageDetailsPage } from "@/components/accounts/brokerage-details-page";
import { getCurrentBrokerageBalances } from "@/lib/brokerage/balances";
import {
  getBrokerageTransactionImportStatus,
  getCurrentBrokerageTransactions,
} from "@/lib/brokerage/transactions";
import { getCurrentUserId } from "@/lib/auth/session";

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
      <BrokerageDetailsPage
        initialAccounts={accounts}
        initialTransactions={transactions}
        initialTransactionsSyncing={transactionImportStatus.isSyncing}
      />
    </div>
  );
}
