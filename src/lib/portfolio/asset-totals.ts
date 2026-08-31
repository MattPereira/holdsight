import type { BalancesResult } from "@/lib/portfolio/types";
import type { Plan } from "@/lib/portfolio/plan";

export type AssetTotal = {
  key: string;
  symbol: string;
  name?: string;
  amount: number;
  valueUsd: number;
};

export type PortfolioAssetSummary = {
  grandTotalValue: number;
  totals: AssetTotal[];
};

/**
 * A row in the holdings summary. Unplanned assets have an empty `members`
 * array; planned assets carry their underlying holdings so the UI can expand
 * them. A Plan's `amount` is meaningless (different symbols) so callers should
 * only render it for single-asset rows.
 */
export type AssetTotalRow = {
  key: string;
  label: string;
  name?: string;
  amount: number;
  valueUsd: number;
  isPlan: boolean;
  color?: string | null;
  members: AssetTotal[];
};

function symbolKey(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Fold assets assigned to Plans into combined rows. Members are matched
 * case-insensitively by symbol. A Plan with no held members is omitted, so
 * combined totals only ever reflect assets the user actually holds.
 */
export function applyPlans(
  totals: AssetTotal[],
  plans: Plan[],
): AssetTotalRow[] {
  const symbolToPlanId = new Map<string, string>();
  const planById = new Map<string, Plan>();
  for (const plan of plans) {
    planById.set(plan.id, plan);
    for (const symbol of plan.symbols) {
      symbolToPlanId.set(symbolKey(symbol), plan.id);
    }
  }

  const planned = new Map<string, AssetTotal[]>();
  const rows: AssetTotalRow[] = [];

  for (const total of totals) {
    const planId = symbolToPlanId.get(symbolKey(total.symbol));
    if (planId && planById.has(planId)) {
      const members = planned.get(planId);
      if (members) {
        members.push(total);
      } else {
        planned.set(planId, [total]);
      }
    } else {
      rows.push({
        key: total.key,
        label: total.symbol,
        name: total.name,
        amount: total.amount,
        valueUsd: total.valueUsd,
        isPlan: false,
        members: [],
      });
    }
  }

  for (const [planId, members] of planned) {
    const plan = planById.get(planId)!;
    // A single-member Plan still renders as a Plan so its name/color stick.
    if (members.length < 2) {
      const [member] = members;
      rows.push({
        key: `plan:${planId}`,
        label: plan.name,
        name: member.name,
        amount: member.amount,
        valueUsd: member.valueUsd,
        isPlan: true,
        color: plan.color,
        members,
      });
      continue;
    }

    members.sort((a, b) => b.valueUsd - a.valueUsd);
    rows.push({
      key: `plan:${planId}`,
      label: plan.name,
      amount: 0,
      valueUsd: members.reduce((sum, member) => sum + member.valueUsd, 0),
      isPlan: true,
      color: plan.color,
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
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

/**
 * Map each planned/unplanned row key to its allocation color. Rows are ordered
 * by value (see {@link applyPlans}), so the assignment is stable as long
 * as both the chart and the table start from the same totals/Plans.
 *
 * Auto-assigned rows claim the first palette color not already taken — by a
 * manual pick or an earlier auto row — so no two slices share a hue until all
 * {@link ASSET_CHART_COLORS} are exhausted, at which point we cycle. Manual
 * picks always win, even if that means a later auto row has to reuse the hue.
 */
export function assetColorByKey(
  totals: AssetTotal[],
  plans: Plan[],
): Map<string, string> {
  const rows = applyPlans(totals, plans);
  const used = new Set(
    rows.map((row) => row.color).filter((color): color is string => !!color),
  );

  let cursor = 0;
  const nextAutoColor = (): string => {
    for (let i = 0; i < ASSET_CHART_COLORS.length; i++) {
      const color = ASSET_CHART_COLORS[cursor % ASSET_CHART_COLORS.length];
      cursor++;
      if (!used.has(color)) {
        used.add(color);
        return color;
      }
    }
    // Every color is spoken for: fall back to cycling by position.
    return ASSET_CHART_COLORS[cursor++ % ASSET_CHART_COLORS.length];
  };

  const colors = new Map<string, string>();
  for (const row of rows) {
    colors.set(row.key, row.color ?? nextAutoColor());
  }
  return colors;
}

function totalAssetSymbol(symbol: string): string {
  return symbol.trim();
}

function totalAssetKey(
  balance: Extract<BalancesResult, { status: "ready" }>["balances"][number],
): string {
  return balance.aggregationKey ?? totalAssetSymbol(balance.symbol);
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
      const key = totalAssetKey(balance);
      const total = totals.get(key);

      if (total) {
        total.amount += balance.amount;
        total.valueUsd += balance.valueUsd;
        total.name ??= balance.name;
      } else {
        totals.set(key, {
          key,
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
