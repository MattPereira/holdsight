import { AccountDetailsPage } from "@/components/account-details-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { getCurrentHyperCoreBalances } from "@/lib/hyper-core/balances";

export default async function HyperCorePage() {
  const userId = await getCurrentUserId();
  const hyperCoreAccounts = userId
    ? await getUserHyperCoreAccounts(userId)
    : [];
  const balanceResults =
    await getCurrentHyperCoreBalances(hyperCoreAccounts);

  return (
    <div className="flex flex-col gap-6">
      <AccountDetailsPage
        initialResults={balanceResults}
        source="hypercore"
        title="HyperCore"
      />
    </div>
  );
}
