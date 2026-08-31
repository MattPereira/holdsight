"use client";

import { useMemo } from "react";
import { Pie, PieChart } from "recharts";

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
import { Sensitive } from "@/components/sensitive";
import { cn } from "@/lib/utils";
import { formatCompactUsd, formatPercent, formatUsd } from "@/lib/format";
import { buildPortfolioAllocations } from "@/lib/portfolio/allocations";
import {
  applyPlans,
  ASSET_CHART_COLORS,
  assetColorByKey,
  type AssetTotal,
} from "@/lib/portfolio/asset-totals";
import type { Plan } from "@/lib/portfolio/plan";

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
  isPlan?: boolean;
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
  plans,
  totalLabel,
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
  plans: Plan[];
  totalLabel: string;
}) {
  const { chartData, chartConfig } = useMemo(() => {
    const rows = applyPlans(totals, plans);
    const colorByKey = assetColorByKey(totals, plans);
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
  }, [totals, plans]);

  return (
    // The centre label is HTML overlaid on the chart rather than an SVG <text>
    // inside it: the donut hole is the container's centre, and HTML keeps the
    // figure stylable by the same rules as every other Sensitive Value.
    <div className="relative mx-auto w-full max-w-95 sm:max-w-75 lg:max-w-110">
      <ChartContainer
        config={chartConfig}
        className="aspect-square h-auto w-full"
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
                      <Sensitive>{formatUsd(Number(value))}</Sensitive>
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
          />
        </PieChart>
      </ChartContainer>

      {/* Transparent to pointer events so the slices underneath stay hoverable. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl font-semibold tabular-nums md:text-2xl">
            <Sensitive>{formatCompactUsd(grandTotalValue)}</Sensitive>
          </span>
          <span className="text-xs text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
    </div>
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
          // The weight is a percentage and stays legible; only the USD value
          // beside it reveals the size of the holding.
          value: formatPercent(row.weight),
          secondaryValue: <Sensitive>{formatUsd(row.valueUsd)}</Sensitive>,
        };

        if (!row.isPlan) {
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
                  value={formatPercent(member.weight)}
                  secondaryValue={
                    <Sensitive>{formatUsd(member.valueUsd)}</Sensitive>
                  }
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
  plans = [],
  // "Net Worth" is only true of the whole portfolio. A single account's donut
  // covers that account's holdings, so its caller says so.
  totalLabel = "Net Worth",
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
  plans?: Plan[];
  totalLabel?: string;
}) {
  const allocations = useMemo(
    () =>
      buildPortfolioAllocations({
        grandTotalValueUsd: grandTotalValue,
        totals,
        plans,
      }),
    [grandTotalValue, totals, plans],
  );
  const { visibleTotals } = allocations;
  const colorByKey = useMemo(
    () => assetColorByKey(visibleTotals, plans),
    [visibleTotals, plans],
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
        isPlan: row.isPlan,
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
        plans={plans}
        totalLabel={totalLabel}
      />
      <div className="min-w-0">
        <HoldingsRows rows={rows} colorByKey={colorByKey} />
      </div>
    </section>
  );
}
