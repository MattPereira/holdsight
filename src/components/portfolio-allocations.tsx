"use client";

import { RiArrowRightSLine } from "@remixicon/react";
import { useMemo, useState } from "react";
import { Label, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
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

const MIN_VISIBLE_ASSET_VALUE_USD = 1;

function weightOf(valueUsd: number, grandTotalValue: number) {
  return grandTotalValue === 0 ? 0 : valueUsd / grandTotalValue;
}

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
                    Net Assets
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

function SummaryList({
  rows,
  totalValue,
  expanded,
  onToggle,
  colorByKey,
}: {
  rows: HoldingsDisplayRow[];
  totalValue: number;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  colorByKey?: Map<string, string>;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-lg border">
      {rows.map((row) => {
        const weight = weightOf(row.valueUsd, totalValue);
        const isExpanded = expanded.has(row.key);
        const members = row.members ?? [];
        const color = colorByKey?.get(row.key);
        const header = (
          <>
            <span className="flex min-w-0 items-center gap-3">
              <ColorSwatch color={color} className="size-9 rounded-md" />
              <span className="flex min-w-0 flex-col">
                <span
                  className="min-w-0 truncate text-base font-semibold"
                  title={row.symbol}
                >
                  {row.symbol}
                </span>
                {row.name ? (
                  <span
                    className="min-w-0 truncate text-xs text-muted-foreground"
                    title={row.name}
                  >
                    {row.name}
                  </span>
                ) : null}
              </span>
              {row.isGroup ? (
                <RiArrowRightSLine
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    isExpanded && "rotate-90",
                  )}
                />
              ) : null}
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="text-base font-semibold tabular-nums">
                {percentFormat.format(weight)}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatUsd(row.valueUsd)}
              </span>
            </span>
          </>
        );
        return (
          <li key={row.key}>
            {row.isGroup ? (
              <button
                type="button"
                onClick={() => onToggle(row.key)}
                aria-expanded={isExpanded}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
              >
                {header}
              </button>
            ) : (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                {header}
              </div>
            )}
            {row.isGroup ? (
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <ul className="relative flex flex-col gap-2 pb-3 pl-16 pr-4 before:absolute before:bottom-3 before:left-[34px] before:top-0 before:w-px before:bg-border">
                    {members.map((member) => {
                      const memberWeight = weightOf(
                        member.valueUsd,
                        totalValue,
                      );
                      return (
                        <li
                          key={member.key}
                          className="flex items-center justify-between gap-4 text-sm"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span
                              className="min-w-0 truncate font-medium"
                              title={member.symbol}
                            >
                              {member.symbol}
                            </span>
                            {member.name ? (
                              <span
                                className="min-w-0 truncate text-xs text-muted-foreground"
                                title={member.name}
                              >
                                {member.name}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 flex-col items-end">
                            <span className="font-medium tabular-nums">
                              {percentFormat.format(memberWeight)}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {formatUsd(member.valueUsd)}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function HoldingsRows({
  rows,
  totalValue,
  colorByKey,
}: {
  rows: HoldingsDisplayRow[];
  totalValue: number;
  colorByKey?: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <SummaryList
      rows={rows}
      totalValue={totalValue}
      expanded={expanded}
      onToggle={toggle}
      colorByKey={colorByKey}
    />
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
  const visibleTotals = useMemo(
    () =>
      totals.filter((total) => total.valueUsd >= MIN_VISIBLE_ASSET_VALUE_USD),
    [totals],
  );
  const colorByKey = useMemo(
    () => assetColorByKey(visibleTotals, groups),
    [visibleTotals, groups],
  );
  const rows: HoldingsDisplayRow[] = useMemo(
    () =>
      applyAssetGroups(visibleTotals, groups).map((row) => ({
        key: row.key,
        symbol: row.label,
        name: row.name,
        amount: row.amount,
        valueUsd: row.valueUsd,
        isGroup: row.isGroup,
        color: row.color,
        members: row.members.map((member) => ({
          key: member.key,
          symbol: member.symbol,
          name: member.name,
          amount: member.amount,
          valueUsd: member.valueUsd,
        })),
      })),
    [visibleTotals, groups],
  );

  if (visibleTotals.length === 0) {
    return <p className="text-sm text-muted-foreground">No balances.</p>;
  }

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-center">
      <AllocationDonutChart
        grandTotalValue={grandTotalValue}
        totals={visibleTotals}
        groups={groups}
      />
      <div className="min-w-0">
        <HoldingsRows
          rows={rows}
          totalValue={grandTotalValue}
          colorByKey={colorByKey}
        />
      </div>
    </section>
  );
}
