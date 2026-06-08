import { PositionsDisplay } from "@/components/positions-display";
import { WalletManager } from "@/components/wallet-manager";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserWallets } from "@/lib/evm/wallets";
import { getLatestEvmPositionSnapshots } from "@/lib/portfolio/snapshots";

export default async function WalletsPage() {
  const userId = await getCurrentUserId();
  const [wallets, positionSnapshots] = userId
    ? await Promise.all([
        getUserWallets(userId),
        getLatestEvmPositionSnapshots(userId),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <WalletManager initialWallets={wallets} />
      <PositionsDisplay
        initialResults={positionSnapshots}
        source="evm"
        title="EVM Positions"
      />
    </div>
  );
}
