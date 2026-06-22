import { BrokerageDetailsPage } from "@/components/accounts/brokerage-details-page";
import { getCurrentBrokerageBalances } from "@/lib/brokerage/balances";
import { getCurrentBrokerageTransactions } from "@/lib/brokerage/transactions";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function BrokeragePage() {
  const userId = await getCurrentUserId();
  const [accounts, transactions] = userId
    ? await Promise.all([
        getCurrentBrokerageBalances(userId),
        getCurrentBrokerageTransactions(userId),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <BrokerageDetailsPage
        initialAccounts={accounts}
        initialTransactions={transactions}
      />
    </div>
  );
}
