"use client";

import { useMemo } from "react";
import { Label, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  applyAssetGroups,
  ASSET_CHART_COLORS,
  type AssetGroup,
  type AssetTotal,
} from "@/lib/portfolio/asset-totals";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// Compact form for the donut center, where space is tight (e.g. "$182.1K").
const compactUsdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

// Recharts/shadcn keys must be safe CSS-identifier-ish tokens; symbols can
// contain "+" and spaces (e.g. "HYPE + sHYPE"), so slugify them.
function slugify(value: string, index: number): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `asset-${index}`;
}

export function PortfolioAllocationChart({
  grandTotalValue,
  totals,
  groups = [],
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
  groups?: AssetGroup[];
}) {
  const { chartData, chartConfig } = useMemo(() => {
    const rows = applyAssetGroups(totals, groups);
    const config: ChartConfig = { value: { label: "Value" } };
    const data = rows.map((row, index) => {
      const key = slugify(row.label, index);
      const color = ASSET_CHART_COLORS[index % ASSET_CHART_COLORS.length];
      config[key] = { label: row.label, color };
      return {
        asset: key,
        label: row.label,
        value: row.valueUsd,
        fill: color,
      };
    });
    return { chartData: data, chartConfig: config };
  }, [totals, groups]);

  if (totals.length === 0) {
    return null;
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square h-auto w-full max-w-[380px] sm:max-w-[300px] lg:max-w-[440px]"
    >
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              nameKey="asset"
              formatter={(value, _name, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {item.payload.label}
                  </span>
                  <span className="font-medium tabular-nums">
                    {usdFormat.format(Number(value))}
                    {grandTotalValue > 0
                      ? ` (${((Number(value) / grandTotalValue) * 100).toFixed(2)}%)`
                      : ""}
                  </span>
                </div>
              )}
            />
          }
        />
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="asset"
          innerRadius="50%"
          strokeWidth={2}
          stroke="var(--background)"
        >
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) {
                return null;
              }
              const { cx, cy } = viewBox;
              return (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  <tspan
                    x={cx}
                    y={(cy ?? 0) - 8}
                    className="fill-foreground text-xl font-semibold tabular-nums"
                  >
                    {compactUsdFormat.format(grandTotalValue)}
                  </tspan>
                  <tspan
                    x={cx}
                    y={(cy ?? 0) + 14}
                    className="fill-muted-foreground text-xs"
                  >
                    Total Assets
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
