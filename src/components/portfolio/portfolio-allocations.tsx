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
  CollapsibleLineItem,
  LineItemGroup,
  LineItemRow,
  NestedLineItem,
  NestedLineItems,
} from "@/components/ui/line-item";
import { cn } from "@/lib/utils";
import { buildPortfolioAllocations } from "@/lib/portfolio/allocations";
import {
  applyAssetGroups,
  ASSET_CHART_COLORS,
  assetColorByKey,
  type AssetGroup,
  type AssetTotal,
} from "@/lib/portfolio/asset-totals";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const percentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  style: "percent",
});

// Compact form for the donut center, where space is tight (e.g. "$182.1K").
const compactUsdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatUsd(value: number) {
  return usdFormat.format(value);
}

// Recharts/shadcn keys must be safe CSS-identifier-ish tokens; symbols can
// contain "+" and spaces (e.g. "HYPE + sHYPE"), so slugify them.
function slugify(value: string, index: number): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `asset-${index}`;
}

type HoldingsDisplayRow = {
  key: string;
  symbol: string;
  name?: string;
  amount: number;
  valueUsd: number;
  weight: number;
  isGroup?: boolean;
  members?: HoldingsDisplayRow[];
};

function ColorSwatch({
  color,
  className,
}: {
  color?: string;
  className?: string;
}) {
  if (!color) {
    return null;
  }
  return (
    <span
      aria-hidden="true"
      className={cn("size-2.5 shrink-0 rounded-[3px]", className)}
      style={{ backgroundColor: color }}
    />
  );
}

function AllocationDonutChart({
  grandTotalValue,
  totals,
  groups,
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
  groups: AssetGroup[];
}) {
  const { chartData, chartConfig } = useMemo(() => {
    const rows = applyAssetGroups(totals, groups);
    const colorByKey = assetColorByKey(totals, groups);
    const config: ChartConfig = { value: { label: "Value" } };
    const data = rows.map((row, index) => {
      const key = slugify(row.label, index);
      const color = colorByKey.get(row.key) ?? ASSET_CHART_COLORS[0];
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

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square h-auto w-full max-w-95 sm:max-w-75 lg:max-w-110"
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
          innerRadius="57%"
          outerRadius="92%"
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
                    className="fill-foreground text-xl md:text-2xl font-semibold tabular-nums"
                  >
                    {compactUsdFormat.format(grandTotalValue)}
                  </tspan>
                  <tspan
                    x={cx}
                    y={(cy ?? 0) + 14}
                    className="fill-muted-foreground text-xs"
                  >
                    Net Worth
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

function HoldingsRows({
  rows,
  colorByKey,
}: {
  rows: HoldingsDisplayRow[];
  colorByKey?: Map<string, string>;
}) {
  return (
    <LineItemGroup type="multiple">
      {rows.map((row) => {
        const fields = {
          leading: (
            <ColorSwatch
              color={colorByKey?.get(row.key)}
              className="size-9 rounded-md"
            />
          ),
          label: row.symbol,
          labelTitle: row.symbol,
          sublabel: row.name,
          sublabelTitle: row.name,
          value: percentFormat.format(row.weight),
          secondaryValue: formatUsd(row.valueUsd),
        };

        if (!row.isGroup) {
          return <LineItemRow key={row.key} {...fields} />;
        }

        return (
          <CollapsibleLineItem key={row.key} id={row.key} {...fields}>
            <NestedLineItems>
              {(row.members ?? []).map((member) => (
                <NestedLineItem
                  key={member.key}
                  label={member.symbol}
                  labelTitle={member.symbol}
                  sublabel={member.name}
                  sublabelTitle={member.name}
                  value={percentFormat.format(member.weight)}
                  secondaryValue={formatUsd(member.valueUsd)}
                />
              ))}
            </NestedLineItems>
          </CollapsibleLineItem>
        );
      })}
    </LineItemGroup>
  );
}

export function PortfolioAllocations({
  grandTotalValue,
  totals,
  groups = [],
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
  groups?: AssetGroup[];
}) {
  const allocations = useMemo(
    () =>
      buildPortfolioAllocations({
        grandTotalValueUsd: grandTotalValue,
        totals,
        groups,
      }),
    [grandTotalValue, totals, groups],
  );
  const { visibleTotals } = allocations;
  const colorByKey = useMemo(
    () => assetColorByKey(visibleTotals, groups),
    [visibleTotals, groups],
  );
  const rows: HoldingsDisplayRow[] = useMemo(
    () =>
      allocations.rows.map((row) => ({
        key: row.key,
        symbol: row.label,
        name: row.name,
        amount: row.amount,
        valueUsd: row.valueUsd,
        weight: row.weight,
        isGroup: row.isGroup,
        color: row.color,
        members: row.members.map((member) => ({
          key: member.key,
          symbol: member.symbol,
          name: member.name,
          amount: member.amount,
          valueUsd: member.valueUsd,
          weight: member.weight,
        })),
      })),
    [allocations.rows],
  );

  if (visibleTotals.length === 0) {
    return null;
  }

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-center">
      <AllocationDonutChart
        grandTotalValue={grandTotalValue}
        totals={visibleTotals}
        groups={groups}
      />
      <div className="min-w-0">
        <HoldingsRows rows={rows} colorByKey={colorByKey} />
      </div>
    </section>
  );
}
