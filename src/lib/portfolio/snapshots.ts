import "server-only";

import { getLatestEvmPositionSnapshots } from "@/lib/evm/snapshots";
import { getUserHyperCoreAccounts } from "@/lib/hyper-core/accounts";
import { getLatestHyperCoreSpotPositionsByAccountId } from "@/lib/hyper-core/snapshots";
import type { PositionsResult } from "@/lib/portfolio/types";

export async function getLatestPortfolioPositionSnapshots(
  userId: string,
): Promise<PositionsResult[]> {
  const evmResults = await getLatestEvmPositionSnapshots(userId);
  const hyperCoreAccounts = await getUserHyperCoreAccounts(userId);
  const hyperCoreAccountByAddress = new Map(
    hyperCoreAccounts.map((account) => [account.address, account]),
  );

  return Promise.all(
    evmResults.map(async (result) => {
      const hyperCoreAccount = hyperCoreAccountByAddress.get(result.address);
      const hyperCoreSpotPositions = hyperCoreAccount
        ? await getLatestHyperCoreSpotPositionsByAccountId(hyperCoreAccount.id)
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
