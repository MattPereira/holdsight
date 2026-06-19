import "server-only";

import { applyAssetGroups } from "@/lib/portfolio/asset-totals";
import { getCurrentPortfolioHomeData } from "@/lib/portfolio/page-data";
import { refreshPortfolioForUser } from "@/lib/portfolio/refresh";
import { getUserAssetGroups } from "@/lib/portfolio/groups";

const MIN_AGENT_ASSET_VALUE_USD = 10;

export type AgentPortfolioAllocation =
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

export type AgentPortfolioAllocations = {
  retrievedAt: string;
  refreshed: boolean;
  portfolio: {
    grandTotalValueUsd: number;
    minimumAssetValueUsd: number;
    otherValueUsd: number;
    allocations: AgentPortfolioAllocation[];
  };
};

export async function getAgentPortfolioAllocations(
  userId: string,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<AgentPortfolioAllocations> {
  const data = refresh
    ? await refreshPortfolioForUser(userId)
    : await getCurrentPortfolioHomeData(userId);
  const grandTotalValueUsd = data.portfolioSummary.grandTotalValue;
  const groups = await getUserAssetGroups(userId);
  const visibleAssets = data.portfolioSummary.totals.filter(
    (asset) => asset.valueUsd >= MIN_AGENT_ASSET_VALUE_USD,
  );
  const visibleValueUsd = visibleAssets.reduce(
    (sum, asset) => sum + asset.valueUsd,
    0,
  );

  return {
    retrievedAt: new Date().toISOString(),
    refreshed: refresh,
    portfolio: {
      grandTotalValueUsd,
      minimumAssetValueUsd: MIN_AGENT_ASSET_VALUE_USD,
      otherValueUsd: Math.max(0, grandTotalValueUsd - visibleValueUsd),
      allocations: applyAssetGroups(visibleAssets, groups).map((row) => {
        const weight =
          grandTotalValueUsd === 0 ? 0 : row.valueUsd / grandTotalValueUsd;

        if (!row.isGroup) {
          return {
            type: "asset",
            symbol: row.label,
            name: row.name ?? null,
            amount: row.amount,
            valueUsd: row.valueUsd,
            weight,
          };
        }

        const groupId = row.key.startsWith("group:")
          ? row.key.slice("group:".length)
          : row.key;
        const group = groups.find((candidate) => candidate.id === groupId);

        return {
          type: "group",
          id: groupId,
          name: row.label,
          userDefinedName: group?.name ?? null,
          valueUsd: row.valueUsd,
          weight,
          members: row.members.map((member) => ({
            symbol: member.symbol,
            name: member.name ?? null,
            amount: member.amount,
            valueUsd: member.valueUsd,
            weight:
              grandTotalValueUsd === 0
                ? 0
                : member.valueUsd / grandTotalValueUsd,
          })),
        };
      }),
    },
  };
}
