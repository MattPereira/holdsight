import "server-only";

import { evmBalanceDetails } from "@/db/schema/investment-accounts";
import { getUserEvmAccounts, type SavedEvmAccount } from "@/lib/evm/accounts";
import { getWalletBalances } from "@/lib/evm/client";
import type { BalancesResult } from "@/lib/portfolio/types";
import {
  getCurrentWalletFamilyBalances,
  replaceWalletFamilyAccountBalances,
} from "@/lib/wallets/balance-family";

const ZERION_PROVIDER = "zerion";

const EVM_DETAIL = {
  table: evmBalanceDetails,
  chainId: evmBalanceDetails.chainId,
  contractAddress: evmBalanceDetails.contractAddress,
};

export async function replaceEvmAccountBalances(
  investmentAccountId: string,
  result: BalancesResult,
): Promise<void> {
  await replaceWalletFamilyAccountBalances(investmentAccountId, result, {
    syncProvider: ZERION_PROVIDER,
    assetClass: () => "token",
    insertDetails: async (tx, inserted, balances) => {
      const details = inserted.map((balance, index) => ({
        balanceId: balance.id,
        chainId: balances[index]?.chainId ?? "unknown",
        contractAddress: balances[index]?.contractAddress,
      }));
      await tx.insert(evmBalanceDetails).values(details);
    },
  });
}

export async function getCurrentEvmBalances(
  userId: string,
): Promise<BalancesResult[]> {
  const wallets = await getUserEvmAccounts(userId);
  return getCurrentWalletFamilyBalances(wallets, {
    chainId: "unknown",
    defaultErrorMessage: "Balance sync failed.",
    detail: EVM_DETAIL,
  });
}

/**
 * Fetch EVM balances for every tracked wallet. Called from the client only on
 * a button click, so this is the single place a Zerion request is triggered.
 *
 * Wallets are fetched sequentially so we never burst past the per-second rate
 * limit. If we get rate limited, we stop immediately rather than spending more
 * of the limited daily quota on calls that would also fail.
 */
export async function syncEvmWalletBalances(
  wallets: SavedEvmAccount[],
): Promise<void> {
  for (const wallet of wallets) {
    const result = await getWalletBalances(wallet.address);
    await replaceEvmAccountBalances(wallet.id, result);
    if (result.status === "rate_limited") break;
  }
}
