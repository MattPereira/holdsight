import type { BalancesResult } from "@/lib/portfolio/types";

export type AssetTotal = {
  symbol: string;
  name?: string;
  amount: number;
  valueUsd: number;
};

export type PortfolioAssetSummary = {
  grandTotalValue: number;
  totals: AssetTotal[];
};

export type AssetGroup = {
  id: string;
  name: string | null;
  color: string | null;
  symbols: string[];
};

/**
 * A row in the holdings summary. Ungrouped assets have an empty `members`
 * array; grouped assets carry their underlying holdings so the UI can expand
 * them. A group's `amount` is meaningless (different symbols) so callers should
 * only render it for single-asset rows.
 */
export type AssetTotalRow = {
  key: string;
  label: string;
  name?: string;
  amount: number;
  valueUsd: number;
  isGroup: boolean;
  color?: string | null;
  members: AssetTotal[];
};

function symbolKey(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** Label a group by its name, falling back to its members joined with " + ". */
export function groupLabel(name: string | null, memberSymbols: string[]): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : memberSymbols.join(" + ");
}

/**
 * Fold grouped assets into combined rows. Members are matched to groups
 * case-insensitively by symbol. A group with no held members is omitted, so
 * combined totals only ever reflect assets the user actually holds.
 */
export function applyAssetGroups(
  totals: AssetTotal[],
  groups: AssetGroup[],
): AssetTotalRow[] {
  const symbolToGroupId = new Map<string, string>();
  const groupById = new Map<string, AssetGroup>();
  for (const group of groups) {
    groupById.set(group.id, group);
    for (const symbol of group.symbols) {
      symbolToGroupId.set(symbolKey(symbol), group.id);
    }
  }

  const grouped = new Map<string, AssetTotal[]>();
  const rows: AssetTotalRow[] = [];

  for (const total of totals) {
    const groupId = symbolToGroupId.get(symbolKey(total.symbol));
    if (groupId && groupById.has(groupId)) {
      const members = grouped.get(groupId);
      if (members) {
        members.push(total);
      } else {
        grouped.set(groupId, [total]);
      }
    } else {
      rows.push({
        key: total.symbol,
        label: total.symbol,
        name: total.name,
        amount: total.amount,
        valueUsd: total.valueUsd,
        isGroup: false,
        members: [],
      });
    }
  }

  for (const [groupId, members] of grouped) {
    if (members.length < 2) {
      rows.push(
        ...members.map((member) => ({
          key: member.symbol,
          label: member.symbol,
          name: member.name,
          amount: member.amount,
          valueUsd: member.valueUsd,
          isGroup: false,
          members: [],
        })),
      );
      continue;
    }

    const group = groupById.get(groupId)!;
    members.sort((a, b) => b.valueUsd - a.valueUsd);
    const memberSymbols = members.map((member) => member.symbol);
    rows.push({
      key: `group:${groupId}`,
      label: groupLabel(group.name, memberSymbols),
      amount: 0,
      valueUsd: members.reduce((sum, member) => sum + member.valueUsd, 0),
      isGroup: true,
      color: group.color,
      members,
    });
  }

  return rows.sort((a, b) => b.valueUsd - a.valueUsd);
}

/**
 * Themed colors for the allocation pie, cycled across however many top-level
 * rows there are. Shared with the holdings table so each asset's swatch matches
 * its pie slice.
 */
export const ASSET_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/**
 * Map each grouped/ungrouped row key to its allocation color. Rows are ordered
 * by value (see {@link applyAssetGroups}), so the assignment is stable as long
 * as both the chart and the table start from the same totals/groups.
 */
export function assetColorByKey(
  totals: AssetTotal[],
  groups: AssetGroup[],
): Map<string, string> {
  const colors = new Map<string, string>();
  applyAssetGroups(totals, groups).forEach((row, index) => {
    colors.set(
      row.key,
      row.color ?? ASSET_CHART_COLORS[index % ASSET_CHART_COLORS.length],
    );
  });
  return colors;
}

function totalAssetSymbol(symbol: string): string {
  return symbol.trim();
}

export function walletTotal(result: BalancesResult): number {
  return result.status === "ready"
    ? result.balances.reduce((sum, balance) => sum + balance.valueUsd, 0)
    : 0;
}

export function grandTotal(results: BalancesResult[]): number {
  return results.reduce((sum, result) => sum + walletTotal(result), 0);
}

export function aggregateAssetTotals(results: BalancesResult[]): AssetTotal[] {
  const totals = new Map<string, AssetTotal>();

  for (const result of results) {
    if (result.status !== "ready") continue;

    for (const balance of result.balances) {
      const symbol = totalAssetSymbol(balance.symbol);
      const total = totals.get(symbol);

      if (total) {
        total.amount += balance.amount;
        total.valueUsd += balance.valueUsd;
        total.name ??= balance.name;
      } else {
        totals.set(symbol, {
          symbol,
          name: balance.name,
          amount: balance.amount,
          valueUsd: balance.valueUsd,
        });
      }
    }
  }

  const assetTotals = Array.from(totals.values());

  return assetTotals.sort((a, b) => b.valueUsd - a.valueUsd);
}

export function portfolioAssetSummary(
  results: BalancesResult[],
): PortfolioAssetSummary {
  return {
    grandTotalValue: grandTotal(results),
    totals: aggregateAssetTotals(results),
  };
}
