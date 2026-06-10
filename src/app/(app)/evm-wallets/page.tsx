import { AccountDetailsPage } from "@/components/account-details-page";
import { WalletManager } from "@/components/wallet-manager";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserEvmAccounts } from "@/lib/evm/accounts";
import { getCurrentEvmBalances } from "@/lib/evm/balances";

export default async function WalletsPage() {
  const userId = await getCurrentUserId();
  const [wallets, balanceResults] = userId
    ? await Promise.all([
        getUserEvmAccounts(userId),
        getCurrentEvmBalances(userId),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <AccountDetailsPage
        initialResults={balanceResults}
        source="evm"
        title="EVM Wallets"
        headerAction={<WalletManager initialWallets={wallets} />}
      />
    </div>
  );
}
