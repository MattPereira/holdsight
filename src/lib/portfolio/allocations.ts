import {
  applyAssetGroups,
  type AssetGroup,
  type AssetTotal,
} from "@/lib/portfolio/asset-totals";
import type { AssetGroupThesis } from "@/lib/portfolio/asset-group-thesis";

// UI-only declutter threshold. An asset is collapsed into the "Other" bucket
// when its value falls below 0.1% of the portfolio, but holdings above the
// absolute cap are never hidden (so large portfolios don't hide still-material
// positions). Pass `minimumAssetValueUsd` explicitly to override — e.g. agents
// pass `Number.NEGATIVE_INFINITY` to receive every holding with no cutoff.
export const ALLOCATION_MIN_WEIGHT = 0.001;
export const ALLOCATION_MAX_HIDDEN_VALUE_USD = 100;

export function effectiveMinimumAssetValueUsd(grandTotalValueUsd: number) {
  return Math.min(
    ALLOCATION_MAX_HIDDEN_VALUE_USD,
    grandTotalValueUsd * ALLOCATION_MIN_WEIGHT,
  );
}

export type PortfolioAllocationMember = {
  key: string;
  symbol: string;
  name?: string;
  amount: number;
  valueUsd: number;
  weight: number;
};

export type PortfolioAllocationRow = {
  key: string;
  label: string;
  name?: string;
  amount: number;
  valueUsd: number;
  weight: number;
  isGroup: boolean;
  groupId?: string;
  userDefinedName?: string | null;
  thesis?: AssetGroupThesis;
  targetAllocationPercent?: number | null;
  color?: string | null;
  members: PortfolioAllocationMember[];
};

export type PortfolioAllocations = {
  grandTotalValueUsd: number;
  minimumAssetValueUsd: number;
  otherValueUsd: number;
  visibleTotals: AssetTotal[];
  rows: PortfolioAllocationRow[];
};

function weightOf(valueUsd: number, grandTotalValueUsd: number) {
  return grandTotalValueUsd === 0 ? 0 : valueUsd / grandTotalValueUsd;
}

function groupIdFromKey(key: string) {
  return key.startsWith("group:") ? key.slice("group:".length) : key;
}

export function buildPortfolioAllocations({
  grandTotalValueUsd,
  totals,
  groups,
  minimumAssetValueUsd = effectiveMinimumAssetValueUsd(grandTotalValueUsd),
}: {
  grandTotalValueUsd: number;
  totals: AssetTotal[];
  groups: AssetGroup[];
  minimumAssetValueUsd?: number;
}): PortfolioAllocations {
  const visibleTotals = totals.filter(
    (total) => total.valueUsd >= minimumAssetValueUsd,
  );
  const visibleValueUsd = visibleTotals.reduce(
    (sum, total) => sum + total.valueUsd,
    0,
  );

  return {
    grandTotalValueUsd,
    minimumAssetValueUsd,
    otherValueUsd: Math.max(0, grandTotalValueUsd - visibleValueUsd),
    visibleTotals,
    rows: applyAssetGroups(visibleTotals, groups).map((row) => {
      const groupId = row.isGroup ? groupIdFromKey(row.key) : undefined;
      const group = groupId
        ? groups.find((candidate) => candidate.id === groupId)
        : undefined;

      return {
        key: row.key,
        label: row.label,
        name: row.name,
        amount: row.amount,
        valueUsd: row.valueUsd,
        weight: weightOf(row.valueUsd, grandTotalValueUsd),
        isGroup: row.isGroup,
        groupId,
        userDefinedName: group?.name ?? null,
        thesis: group?.thesis,
        targetAllocationPercent: group?.targetAllocationPercent ?? null,
        color: row.color,
        members: row.members.map((member) => ({
          key: member.key,
          symbol: member.symbol,
          name: member.name,
          amount: member.amount,
          valueUsd: member.valueUsd,
          weight: weightOf(member.valueUsd, grandTotalValueUsd),
        })),
      };
    }),
  };
}
