"use client";

import { RiArrowDownSLine, RiArrowRightSLine } from "@remixicon/react";
import { Fragment, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function WeightBar({
  weight,
  className,
}: {
  weight: number;
  className?: string;
}) {
  return (
    <div
      className={cn("h-2.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full rounded-full bg-primary/70"
        style={{ width: `${Math.min(weight, 1) * 100}%` }}
      />
    </div>
  );
}

export type HoldingsDisplayRow = {
  key: string;
  symbol: string;
  priceUsd: number;
  amount: number;
  valueUsd: number;
  detail?: string;
  isGroup?: boolean;
  members?: HoldingsDisplayRow[];
};

function ColorSwatch({ color }: { color?: string }) {
  if (!color) {
    return null;
  }
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-[3px]"
      style={{ backgroundColor: color }}
    />
  );
}

function GroupToggle({
  label,
  expanded,
  onToggle,
  color,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  color?: string;
}) {
  const Chevron = expanded ? RiArrowDownSLine : RiArrowRightSLine;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full min-w-0 items-center gap-1.5 text-left"
    >
      <Chevron className="size-4 shrink-0 text-muted-foreground" />
      <ColorSwatch color={color} />
      <span className="truncate" title={label}>
        {label}
      </span>
    </button>
  );
}

function DesktopHoldingsTable({
  rows,
  showWeight,
  totalValue,
  expanded,
  onToggle,
  colorByKey,
}: {
  rows: HoldingsDisplayRow[];
  showWeight: boolean;
  totalValue: number;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  colorByKey?: Map<string, string>;
}) {
  return (
    <div className="hidden overflow-hidden rounded-lg border sm:block">
      <Table className="table-fixed">
        {showWeight ? (
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[28%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[20%]" />
          </colgroup>
        ) : (
          <colgroup>
            <col className="w-[25%]" />
            <col className="w-[25%]" />
            <col className="w-[20%]" />
            <col className="w-[30%]" />
          </colgroup>
        )}
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead>Asset</TableHead>
            {showWeight ? (
              <TableHead className="text-right">Weight</TableHead>
            ) : null}
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const weight = weightOf(row.valueUsd, totalValue);
            const isExpanded = expanded.has(row.key);
            const members = isExpanded ? (row.members ?? []) : [];
            const color = colorByKey?.get(row.key);
            return (
              <Fragment key={row.key}>
                <TableRow
                  className={cn(
                    row.isGroup && "bg-muted/50",
                    row.isGroup && isExpanded && "border-b-0",
                  )}
                >
                  <TableCell className="font-medium">
                    {row.isGroup ? (
                      <GroupToggle
                        label={row.symbol}
                        expanded={isExpanded}
                        onToggle={() => onToggle(row.key)}
                        color={color}
                      />
                    ) : (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="size-4 shrink-0" aria-hidden="true" />
                        <ColorSwatch color={color} />
                        <span className="block truncate" title={row.symbol}>
                          {row.symbol}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  {showWeight ? (
                    <TableCell>
                      <div className="grid grid-cols-[minmax(6rem,1fr)_4rem] items-center gap-3">
                        <WeightBar weight={weight} />
                        <span className="text-right tabular-nums">
                          {percentFormat.format(weight)}
                        </span>
                      </div>
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.isGroup ? "—" : amountFormat.format(row.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.isGroup ? "—" : formatPrice(row.priceUsd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsd(row.valueUsd)}
                  </TableCell>
                </TableRow>
                {members.map((member, memberIndex) => {
                  const memberWeight = weightOf(member.valueUsd, totalValue);
                  return (
                    <TableRow
                      key={`${row.key}:${member.key}`}
                      className={cn(
                        "bg-muted/50",
                        memberIndex < members.length - 1 && "border-b-0",
                      )}
                    >
                      <TableCell className="py-0 font-medium text-muted-foreground">
                        <div className="flex items-stretch">
                          <span className="ml-2 w-px shrink-0 self-stretch bg-border" />
                          <span
                            className="truncate self-center py-2 pl-3"
                            title={member.symbol}
                          >
                            {member.symbol}
                          </span>
                        </div>
                      </TableCell>
                      {showWeight ? (
                        <TableCell>
                          <div className="grid grid-cols-[minmax(6rem,1fr)_4rem] items-center gap-3">
                            <WeightBar weight={memberWeight} />
                            <span className="text-right tabular-nums text-muted-foreground">
                              {percentFormat.format(memberWeight)}
                            </span>
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {amountFormat.format(member.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatPrice(member.priceUsd)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatUsd(member.valueUsd)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MobileSummaryList({
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
    <ul className="divide-y rounded-lg border sm:hidden">
      {rows.map((row) => {
        const weight = weightOf(row.valueUsd, totalValue);
        const isExpanded = expanded.has(row.key);
        const members = isExpanded ? (row.members ?? []) : [];
        const color = colorByKey?.get(row.key);
        return (
          <li key={row.key} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              {row.isGroup ? (
                <span className="min-w-0 text-base font-semibold">
                  <GroupToggle
                    label={row.symbol}
                    expanded={isExpanded}
                    onToggle={() => onToggle(row.key)}
                    color={color}
                  />
                </span>
              ) : (
                <span className="flex min-w-0 items-center gap-1.5 text-base font-semibold">
                  <span className="size-4 shrink-0" aria-hidden="true" />
                  <ColorSwatch color={color} />
                  <span className="truncate" title={row.symbol}>
                    {row.symbol}
                  </span>
                </span>
              )}
              <span className="shrink-0 text-base font-semibold tabular-nums">
                {formatUsd(row.valueUsd)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <WeightBar weight={weight} className="flex-1" />
              <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                {percentFormat.format(weight)}
              </span>
            </div>
            {members.length > 0 ? (
              <ul className="flex flex-col gap-2 border-l pl-3">
                {members.map((member) => {
                  const memberWeight = weightOf(member.valueUsd, totalValue);
                  return (
                    <li key={member.key} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-4 text-sm text-muted-foreground">
                        <span
                          className="min-w-0 truncate"
                          title={member.symbol}
                        >
                          {member.symbol}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatUsd(member.valueUsd)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <WeightBar weight={memberWeight} className="flex-1" />
                        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                          {percentFormat.format(memberWeight)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function MobilePositionList({ rows }: { rows: HoldingsDisplayRow[] }) {
  return (
    <ul className="divide-y rounded-lg border sm:hidden">
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
  mobileVariant,
  colorByKey,
}: {
  rows: HoldingsDisplayRow[];
  totalValue: number;
  mobileVariant: "summary" | "positions";
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
    <>
      <DesktopHoldingsTable
        rows={rows}
        showWeight={mobileVariant === "summary"}
        totalValue={totalValue}
        expanded={expanded}
        onToggle={toggle}
        colorByKey={colorByKey}
      />
      {mobileVariant === "summary" ? (
        <MobileSummaryList
          rows={rows}
          totalValue={totalValue}
          expanded={expanded}
          onToggle={toggle}
          colorByKey={colorByKey}
        />
      ) : (
        <MobilePositionList rows={rows} />
      )}
    </>
  );
}

export function HoldingsSummary({
  grandTotalValue,
  totals,
  groups = [],
  label = "Total Assets",
  showColors = false,
  showHeader = true,
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
  groups?: AssetGroup[];
  label?: string;
  showColors?: boolean;
  showHeader?: boolean;
}) {
  const colorByKey = showColors ? assetColorByKey(totals, groups) : undefined;
  const rows: HoldingsDisplayRow[] = applyAssetGroups(totals, groups).map(
    (row) => ({
      key: row.key,
      symbol: row.label,
      priceUsd: row.isGroup ? 0 : priceOf(row.valueUsd, row.amount),
      amount: row.amount,
      valueUsd: row.valueUsd,
      isGroup: row.isGroup,
      members: row.members.map((member) => ({
        key: member.symbol,
        symbol: member.symbol,
        priceUsd: priceOf(member.valueUsd, member.amount),
        amount: member.amount,
        valueUsd: member.valueUsd,
      })),
    }),
  );

  return (
    <section className="flex flex-col gap-2">
      {showHeader ? (
        <div className="flex items-baseline justify-between gap-4 px-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-sm font-medium tabular-nums">
            {formatUsd(grandTotalValue)}
          </span>
        </div>
      ) : null}
      {totals.length > 0 ? (
        <HoldingsRows
          rows={rows}
          totalValue={grandTotalValue}
          mobileVariant="summary"
          colorByKey={colorByKey}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No positions.</p>
      )}
    </section>
  );
}
