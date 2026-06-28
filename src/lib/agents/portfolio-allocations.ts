import "server-only";

import { buildPortfolioAllocations } from "@/lib/portfolio/allocations";
import { getCurrentPortfolioHomeData } from "@/lib/portfolio/page-data";
import { refreshPortfolioForUser } from "@/lib/portfolio/refresh";
import { getUserAssetGroups } from "@/lib/portfolio/groups";

export type PortfolioAllocationForAgent =
  | {
      type: "asset";
      symbol: string;
      name: string | null;
      amount: number;
      valueUsd: number;
      weight: number;
    }
  | {
      type: "group";
      id: string;
      name: string;
      userDefinedName: string | null;
      thesis: string | null;
      valueUsd: number;
      weight: number;
      members: {
        symbol: string;
        name: string | null;
        amount: number;
        valueUsd: number;
        weight: number;
      }[];
    };

export type PortfolioAllocationsForAgent = {
  retrievedAt: string;
  refreshed: boolean;
  portfolio: {
    grandTotalValueUsd: number;
    allocations: PortfolioAllocationForAgent[];
  };
};

export async function getPortfolioAllocationsForAgent(
  userId: string,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<PortfolioAllocationsForAgent> {
  const data = refresh
    ? await refreshPortfolioForUser(userId)
    : await getCurrentPortfolioHomeData(userId);
  const groups = await getUserAssetGroups(userId);
  // Agents receive every holding with no declutter cutoff — hiding small
  // positions is a UI concern, and a full dataset lets weights reconcile to the
  // grand total without an "Other" remainder.
  const allocations = buildPortfolioAllocations({
    grandTotalValueUsd: data.portfolioSummary.grandTotalValue,
    totals: data.portfolioSummary.totals,
    groups,
    minimumAssetValueUsd: Number.NEGATIVE_INFINITY,
  });

  return {
    retrievedAt: new Date().toISOString(),
    refreshed: refresh,
    portfolio: {
      grandTotalValueUsd: allocations.grandTotalValueUsd,
      allocations: allocations.rows.map((row) => {
        if (!row.isGroup) {
          return {
            type: "asset",
            symbol: row.label,
            name: row.name ?? null,
            amount: row.amount,
            valueUsd: row.valueUsd,
            weight: row.weight,
          };
        }

        return {
          type: "group",
          id: row.groupId ?? row.key,
          name: row.label,
          userDefinedName: row.userDefinedName ?? null,
          thesis: row.thesis ?? null,
          valueUsd: row.valueUsd,
          weight: row.weight,
          members: row.members.map((member) => ({
            symbol: member.symbol,
            name: member.name ?? null,
            amount: member.amount,
            valueUsd: member.valueUsd,
            weight: member.weight,
          })),
        };
      }),
    },
  };
}
