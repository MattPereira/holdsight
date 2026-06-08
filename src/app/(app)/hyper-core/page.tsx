import { PositionsDisplay } from "@/components/positions-display";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { getLatestHyperCorePositionSnapshots } from "@/lib/hyper-core/snapshots";

export default async function HyperCorePage() {
  const userId = await getCurrentUserId();
  const hyperCoreAccounts = userId
    ? await getUserHyperCoreAccounts(userId)
    : [];
  const positionSnapshots = await getLatestHyperCorePositionSnapshots(
    hyperCoreAccounts,
  );

  return (
    <div className="flex flex-col gap-6">
      <PositionsDisplay
        initialResults={positionSnapshots}
        source="hypercore"
        title="HyperCore Positions"
      />
    </div>
  );
}
