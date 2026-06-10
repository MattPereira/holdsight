import { AccountDetailsPage } from "@/components/account-details-page";
import { WalletManager } from "@/components/wallet-manager";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserEvmAccounts } from "@/lib/evm/accounts";
import { getCurrentEvmPositions } from "@/lib/evm/positions";

export default async function WalletsPage() {
  const userId = await getCurrentUserId();
  const [wallets, positionResults] = userId
    ? await Promise.all([
        getUserEvmAccounts(userId),
        getCurrentEvmPositions(userId),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <AccountDetailsPage
        initialResults={positionResults}
        source="evm"
        title="EVM Wallets"
        headerAction={<WalletManager initialWallets={wallets} />}
      />
    </div>
  );
}
