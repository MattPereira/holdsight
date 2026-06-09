import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AssetTotal } from "@/lib/portfolio/asset-totals";

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
      className={cn(
        "h-2 overflow-hidden rounded-full bg-muted",
        className,
      )}
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
};

function DesktopHoldingsTable({
  rows,
  showWeight,
  totalValue,
}: {
  rows: HoldingsDisplayRow[];
  showWeight: boolean;
  totalValue: number;
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
            return (
              <TableRow key={row.key}>
                <TableCell className="font-medium">{row.symbol}</TableCell>
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
                  {amountFormat.format(row.amount)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatPrice(row.priceUsd)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsd(row.valueUsd)}
                </TableCell>
              </TableRow>
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
}: {
  rows: HoldingsDisplayRow[];
  totalValue: number;
}) {
  return (
    <ul className="divide-y rounded-lg border sm:hidden">
      {rows.map((row) => {
        const weight = weightOf(row.valueUsd, totalValue);
        return (
          <li key={row.key} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-base font-semibold">{row.symbol}</span>
              <span className="text-base font-semibold tabular-nums">
                {formatUsd(row.valueUsd)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <WeightBar weight={weight} className="flex-1" />
              <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                {percentFormat.format(weight)}
              </span>
            </div>
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
}: {
  rows: HoldingsDisplayRow[];
  totalValue: number;
  mobileVariant: "summary" | "positions";
}) {
  return (
    <>
      <DesktopHoldingsTable
        rows={rows}
        showWeight={mobileVariant === "summary"}
        totalValue={totalValue}
      />
      {mobileVariant === "summary" ? (
        <MobileSummaryList rows={rows} totalValue={totalValue} />
      ) : (
        <MobilePositionList rows={rows} />
      )}
    </>
  );
}

export function HoldingsSummary({
  grandTotalValue,
  totals,
  label = "Summary",
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
  label?: string;
}) {
  const rows = totals.map((total) => ({
    key: total.symbol,
    symbol: total.symbol,
    priceUsd: priceOf(total.valueUsd, total.amount),
    amount: total.amount,
    valueUsd: total.valueUsd,
  }));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 px-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-medium tabular-nums">
          {formatUsd(grandTotalValue)}
        </span>
      </div>
      {totals.length > 0 ? (
        <HoldingsRows
          rows={rows}
          totalValue={grandTotalValue}
          mobileVariant="summary"
        />
      ) : (
        <p className="text-sm text-muted-foreground">No positions.</p>
      )}
    </section>
  );
}
