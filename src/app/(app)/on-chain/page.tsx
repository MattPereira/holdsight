import { AccountDetailsPage } from "@/components/account-details-page";
import { WalletManager } from "@/components/wallet-manager";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserEvmAccounts } from "@/lib/evm/accounts";
import { getCurrentOnChainBalances } from "@/lib/on-chain/balances";

export default async function OnChainPage() {
  const userId = await getCurrentUserId();
  const wallets = userId ? await getUserEvmAccounts(userId) : [];
  const balanceResults = userId
    ? await getCurrentOnChainBalances(userId, wallets)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <AccountDetailsPage
        initialResults={balanceResults}
        source="onchain"
        title="On Chain"
        headerAction={<WalletManager initialWallets={wallets} />}
      />
    </div>
  );
}
