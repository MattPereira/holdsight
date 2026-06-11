import { BrokerageDetailsPage } from "@/components/brokerage-details-page";
import { getCurrentBrokerageBalances } from "@/lib/brokerage/balances";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function BrokeragePage() {
  const userId = await getCurrentUserId();
  const accounts = userId ? await getCurrentBrokerageBalances(userId) : [];

  return (
    <div className="flex flex-col gap-6">
      <BrokerageDetailsPage initialAccounts={accounts} />
    </div>
  );
}
