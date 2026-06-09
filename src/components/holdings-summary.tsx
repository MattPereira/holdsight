"use client";

import { RiArrowRightSLine } from "@remixicon/react";
import { useState } from "react";

import { PortfolioAllocationChart } from "@/components/portfolio-allocation-chart";
import { cn } from "@/lib/utils";
import {
  applyAssetGroups,
  assetColorByKey,
  type AssetGroup,
  type AssetTotal,
} from "@/lib/portfolio/asset-totals";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const priceFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Sub-dollar prices keep enough significant digits that cheap tokens
// don't collapse to $0.00.
const subDollarPriceFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 4,
});

function formatPrice(price: number) {
  return price !== 0 && Math.abs(price) < 1
    ? subDollarPriceFormat.format(price)
    : priceFormat.format(price);
}

const amountFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

const percentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  style: "percent",
});

function weightOf(valueUsd: number, grandTotalValue: number) {
  return grandTotalValue === 0 ? 0 : valueUsd / grandTotalValue;
}

export function formatUsd(value: number) {
  return usdFormat.format(value);
}

function priceOf(valueUsd: number, amount: number) {
  return amount === 0 ? 0 : valueUsd / amount;
}

export type HoldingsDisplayRow = {
  key: string;
  symbol: string;
  name?: string;
  priceUsd: number;
  amount: number;
  valueUsd: number;
  detail?: string;
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

function PositionList({ rows }: { rows: HoldingsDisplayRow[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{row.symbol}</span>
            <span className="font-medium tabular-nums">
              {formatUsd(row.valueUsd)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
            <span>{row.detail}</span>
            <span className="tabular-nums">
              {amountFormat.format(row.amount)} @ {formatPrice(row.priceUsd)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function HoldingsRows({
  rows,
  totalValue,
  variant,
  colorByKey,
}: {
  rows: HoldingsDisplayRow[];
  totalValue: number;
  variant: "summary" | "positions";
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

  return variant === "summary" ? (
    <SummaryList
      rows={rows}
      totalValue={totalValue}
      expanded={expanded}
      onToggle={toggle}
      colorByKey={colorByKey}
    />
  ) : (
    <PositionList rows={rows} />
  );
}

export function HoldingsSummary({
  grandTotalValue,
  totals,
  groups = [],
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
  groups?: AssetGroup[];
}) {
  const colorByKey = assetColorByKey(totals, groups);
  const rows: HoldingsDisplayRow[] = applyAssetGroups(totals, groups).map(
    (row) => ({
      key: row.key,
      symbol: row.label,
      name: row.name,
      priceUsd: row.isGroup ? 0 : priceOf(row.valueUsd, row.amount),
      amount: row.amount,
      valueUsd: row.valueUsd,
      isGroup: row.isGroup,
      members: row.members.map((member) => ({
        key: member.symbol,
        symbol: member.symbol,
        name: member.name,
        priceUsd: priceOf(member.valueUsd, member.amount),
        amount: member.amount,
        valueUsd: member.valueUsd,
      })),
    }),
  );

  if (totals.length === 0) {
    return <p className="text-sm text-muted-foreground">No positions.</p>;
  }

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-center">
      <PortfolioAllocationChart
        grandTotalValue={grandTotalValue}
        totals={totals}
        groups={groups}
      />
      <div className="min-w-0">
        <HoldingsRows
          rows={rows}
          totalValue={grandTotalValue}
          variant="summary"
          colorByKey={colorByKey}
        />
      </div>
    </section>
  );
}
