import { WalletManager } from "@/components/wallet-manager";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserWallets } from "@/lib/evm/wallets";

export default async function WalletsPage() {
  const userId = await getCurrentUserId();
  const wallets = userId ? await getUserWallets(userId) : [];

  return (
    <div className="flex flex-col">
      <WalletManager initialWallets={wallets} />
    </div>
  );
}
