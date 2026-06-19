import "server-only";

import { revalidatePath } from "next/cache";

import { getUserEvmAccounts } from "@/lib/evm/accounts";
import { syncEvmWalletBalances } from "@/lib/evm/balances";
import { ensureUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { syncHyperCoreAccounts } from "@/lib/hyper-core/balances";
import { syncUserKrakenAccounts } from "@/lib/exchange/kraken/balances";
import { syncUserBrokerageBalances } from "@/lib/brokerage/balances";
import { syncUserDepositoryBalances } from "@/lib/depository/balances";
import { syncUserCreditCardAccounts } from "@/lib/credit-card/balances";
import {
  getCurrentPortfolioHomeData,
  type PortfolioHomeData,
} from "@/lib/portfolio/page-data";

function revalidatePortfolioPaths() {
  revalidatePath("/");
  revalidatePath("/wallets");
  revalidatePath("/exchange");
  revalidatePath("/brokerages");
}

export async function refreshPortfolioForUser(
  userId: string,
): Promise<PortfolioHomeData> {
  const syncWallets = async () => {
    const wallets = await getUserEvmAccounts(userId);
    if (wallets.length === 0) return;

    await syncEvmWalletBalances(wallets);

    const hyperCoreAccounts = await ensureUserHyperCoreAccounts(
      userId,
      wallets,
    );
    await syncHyperCoreAccounts(hyperCoreAccounts);
  };

  await Promise.all([
    syncWallets(),
    syncUserKrakenAccounts(userId),
    syncUserBrokerageBalances(userId),
    syncUserDepositoryBalances(userId),
    syncUserCreditCardAccounts(userId),
  ]);

  revalidatePortfolioPaths();

  return getCurrentPortfolioHomeData(userId);
}
