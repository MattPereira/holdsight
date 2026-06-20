import {
  applyAssetGroups,
  type AssetGroup,
  type AssetTotal,
} from "@/lib/portfolio/asset-totals";

export const MIN_PORTFOLIO_ALLOCATION_VALUE_USD = 10;

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
}: {
  grandTotalValueUsd: number;
  totals: AssetTotal[];
  groups: AssetGroup[];
}): PortfolioAllocations {
  const visibleTotals = totals.filter(
    (total) => total.valueUsd >= MIN_PORTFOLIO_ALLOCATION_VALUE_USD,
  );
  const visibleValueUsd = visibleTotals.reduce(
    (sum, total) => sum + total.valueUsd,
    0,
  );

  return {
    grandTotalValueUsd,
    minimumAssetValueUsd: MIN_PORTFOLIO_ALLOCATION_VALUE_USD,
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
