import { AccountDetailsPage } from "@/components/account-details-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { getCurrentHyperCorePositions } from "@/lib/hyper-core/positions";

export default async function HyperCorePage() {
  const userId = await getCurrentUserId();
  const hyperCoreAccounts = userId
    ? await getUserHyperCoreAccounts(userId)
    : [];
  const positionResults =
    await getCurrentHyperCorePositions(hyperCoreAccounts);

  return (
    <div className="flex flex-col gap-6">
      <AccountDetailsPage
        initialResults={positionResults}
        source="hypercore"
        title="HyperCore"
      />
    </div>
  );
}
