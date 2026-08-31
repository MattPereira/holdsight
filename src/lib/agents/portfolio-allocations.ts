import "server-only";

import { getPlanCompletion } from "@/lib/agents/plans";
import { buildPortfolioAllocations } from "@/lib/portfolio/allocations";
import { getPortfolioBalancesPageData } from "@/lib/portfolio/page-data";
import { getUserPlans } from "@/lib/portfolio/plans";
import { refreshPortfolioForUser } from "@/lib/portfolio/refresh";

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
      type: "plan";
      id: string;
      name: string;
      details: NonNullable<
        ReturnType<typeof buildPortfolioAllocations>["rows"][number]["planDetails"]
      >;
      targetAllocationPercent: number | null;
      completion: ReturnType<typeof getPlanCompletion>;
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
  const [data, plans] = await Promise.all([
    refresh
      ? refreshPortfolioForUser(userId)
      : getPortfolioBalancesPageData(userId),
    getUserPlans(userId),
  ]);
  // Agents receive every holding with no declutter cutoff — hiding small
  // positions is a UI concern, and a full dataset lets allocations reconcile to the
  // grand total without an "Other" remainder.
  const allocations = buildPortfolioAllocations({
    grandTotalValueUsd: data.portfolioSummary.grandTotalValue,
    totals: data.portfolioSummary.totals,
    plans,
    minimumAssetValueUsd: Number.NEGATIVE_INFINITY,
  });

  return {
    retrievedAt: new Date().toISOString(),
    refreshed: refresh,
    portfolio: {
      grandTotalValueUsd: allocations.grandTotalValueUsd,
      allocations: allocations.rows.map((row) => {
        if (!row.isPlan) {
          return {
            type: "asset",
            symbol: row.label,
            name: row.name ?? null,
            amount: row.amount,
            valueUsd: row.valueUsd,
            currentAllocationPercent: row.weight * 100,
          };
        }
        if (!row.planDetails) {
          throw new Error("Plan allocation is missing Plan metadata.");
        }

        return {
          type: "plan",
          id: row.planId ?? row.key,
          name: row.label,
          details: row.planDetails,
          targetAllocationPercent: row.targetAllocationPercent ?? null,
          completion: getPlanCompletion(
            row.planDetails,
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
