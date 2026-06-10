import "server-only";

import { getCurrentEvmBalances } from "@/lib/evm/balances";
import { getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { getCurrentHyperCoreSpotBalancesByAccountId } from "@/lib/hyper-core/balances";
import type { BalancesResult } from "@/lib/portfolio/types";

export async function getCurrentPortfolioBalances(
  userId: string,
): Promise<BalancesResult[]> {
  const evmResults = await getCurrentEvmBalances(userId);
  const hyperCoreAccounts = await getUserHyperCoreAccounts(userId);
  const hyperCoreAccountByAddress = new Map(
    hyperCoreAccounts.map((account) => [account.address, account]),
  );

  return Promise.all(
    evmResults.map(async (result) => {
      const hyperCoreAccount = hyperCoreAccountByAddress.get(result.address);
      const hyperCoreSpotBalances = hyperCoreAccount
        ? await getCurrentHyperCoreSpotBalancesByAccountId(hyperCoreAccount.id)
        : [];

      if (result.status !== "ready") return result;

      return {
        ...result,
        balances: [...result.balances, ...hyperCoreSpotBalances].sort(
          (a, b) => b.valueUsd - a.valueUsd,
        ),
      };
    }),
  );
}
