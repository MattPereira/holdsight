import { PositionsDisplay } from "@/components/positions-display";
import { getLatestPositionSnapshots } from "@/lib/portfolio/snapshots";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function Home() {
  const userId = await getCurrentUserId();
  const positionSnapshots = userId
    ? await getLatestPositionSnapshots(userId)
    : [];

  return (
    <div className="flex flex-col gap-5">
      <PositionsDisplay initialResults={positionSnapshots} />
    </div>
  );
}
