import "server-only";

import { getCurrentEvmPositions } from "@/lib/evm/positions";
import { getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { getCurrentHyperCoreSpotPositionsByAccountId } from "@/lib/hyper-core/positions";
import type { PositionsResult } from "@/lib/portfolio/types";

export async function getCurrentPortfolioPositions(
  userId: string,
): Promise<PositionsResult[]> {
  const evmResults = await getCurrentEvmPositions(userId);
  const hyperCoreAccounts = await getUserHyperCoreAccounts(userId);
  const hyperCoreAccountByAddress = new Map(
    hyperCoreAccounts.map((account) => [account.address, account]),
  );

  return Promise.all(
    evmResults.map(async (result) => {
      const hyperCoreAccount = hyperCoreAccountByAddress.get(result.address);
      const hyperCoreSpotPositions = hyperCoreAccount
        ? await getCurrentHyperCoreSpotPositionsByAccountId(hyperCoreAccount.id)
        : [];

      if (result.status !== "ready") return result;

      return {
        ...result,
        positions: [...result.positions, ...hyperCoreSpotPositions].sort(
          (a, b) => b.valueUsd - a.valueUsd,
        ),
      };
    }),
  );
}
