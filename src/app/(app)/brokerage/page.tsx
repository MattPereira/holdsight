import { BrokerageDetailsPage } from "@/components/brokerage-details-page";
import { getCurrentBrokerageBalances } from "@/lib/brokerage/balances";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserAssetGroups } from "@/lib/portfolio/groups";

export default async function BrokeragePage() {
  const userId = await getCurrentUserId();
  const [accounts, groups] = userId
    ? await Promise.all([
        getCurrentBrokerageBalances(userId),
        getUserAssetGroups(userId),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <BrokerageDetailsPage initialAccounts={accounts} initialGroups={groups} />
    </div>
  );
}
