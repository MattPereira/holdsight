import "server-only";

import { buildPortfolioAllocations } from "@/lib/portfolio/allocations";
import {
  serializeAssetGroupThesis,
  type AssetGroupThesisForAgent,
} from "@/lib/portfolio/asset-group-thesis";
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
      currentAllocationPercent: number;
    }
  | {
      type: "group";
      id: string;
      name: string;
      userDefinedName: string | null;
      thesis: AssetGroupThesisForAgent;
      valueUsd: number;
      currentAllocationPercent: number;
      members: {
        symbol: string;
        name: string | null;
        amount: number;
        valueUsd: number;
        currentAllocationPercent: number;
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
  const [data, groups] = await Promise.all([
    refresh
      ? refreshPortfolioForUser(userId)
      : getCurrentPortfolioHomeData(userId),
    getUserAssetGroups(userId),
  ]);
  // Agents receive every holding with no declutter cutoff — hiding small
  // positions is a UI concern, and a full dataset lets allocations reconcile to the
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
            currentAllocationPercent: row.weight * 100,
          };
        }
        if (!row.thesis) {
          throw new Error("Asset group allocation is missing thesis metadata.");
        }

        return {
          type: "group",
          id: row.groupId ?? row.key,
          name: row.label,
          userDefinedName: row.userDefinedName ?? null,
          thesis: serializeAssetGroupThesis(
            row.thesis,
            row.targetAllocationPercent ?? null,
          ),
          valueUsd: row.valueUsd,
          currentAllocationPercent: row.weight * 100,
          members: row.members.map((member) => ({
            symbol: member.symbol,
            name: member.name ?? null,
            amount: member.amount,
            valueUsd: member.valueUsd,
            currentAllocationPercent: member.weight * 100,
          })),
        };
      }),
    },
  };
}
