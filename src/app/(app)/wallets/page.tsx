import { AccountDetailsPage } from "@/components/accounts/account-details-page";
import { getCurrentUserId } from "@/lib/auth/session";
import { getUserEvmAccounts } from "@/lib/evm/accounts";
import { getCurrentWalletBalances } from "@/lib/wallets/balances";

export default async function WalletsPage() {
  const userId = await getCurrentUserId();
  const wallets = userId ? await getUserEvmAccounts(userId) : [];
  const balanceResults = userId
    ? await getCurrentWalletBalances(userId, wallets)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <AccountDetailsPage
        initialResults={balanceResults}
        source="wallets"
        title="Wallets"
      />
    </div>
  );
}
