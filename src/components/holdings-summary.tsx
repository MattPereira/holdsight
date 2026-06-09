import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AssetTotal } from "@/lib/portfolio/asset-totals";

const usd = new Intl.NumberFormat("en-US", {
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

function DesktopHoldingsTable({
  grandTotalValue,
  totals,
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
}) {
  return (
    <div className="hidden overflow-hidden rounded-lg border sm:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead>Asset</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">Weight</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {totals.map((total) => {
            const weight = weightOf(total.valueUsd, grandTotalValue);
            return (
              <TableRow key={total.symbol}>
                <TableCell className="font-medium">{total.symbol}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPrice(priceOf(total.valueUsd, total.amount))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {amountFormat.format(total.amount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {usd.format(total.valueUsd)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-3">
                    <WeightBar weight={weight} className="w-24" />
                    <span className="w-16 text-right tabular-nums">
                      {percentFormat.format(weight)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell className="text-right tabular-nums">
              {usd.format(grandTotalValue)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {percentFormat.format(grandTotalValue === 0 ? 0 : 1)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function MobileHoldingsList({
  grandTotalValue,
  totals,
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
}) {
  return (
    <ul className="divide-y rounded-lg border sm:hidden">
      {totals.map((total) => {
        const weight = weightOf(total.valueUsd, grandTotalValue);
        return (
          <li key={total.symbol} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-base font-semibold">{total.symbol}</span>
              <span className="text-base font-semibold tabular-nums">
                {usd.format(total.valueUsd)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <WeightBar weight={weight} className="flex-1" />
              <span className="text-sm tabular-nums text-muted-foreground">
                {percentFormat.format(weight)}
              </span>
            </div>
          </li>
        );
      })}
      <li className="flex items-baseline justify-between gap-4 bg-muted/50 px-4 py-3">
        <span className="text-base font-semibold">Total</span>
        <span className="text-base font-semibold tabular-nums">
          {usd.format(grandTotalValue)}
        </span>
      </li>
    </ul>
  );
}

export function HoldingsSummary({
  grandTotalValue,
  totals,
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
}) {
  return (
    <section className="flex flex-col">
      {totals.length > 0 ? (
        <>
          <DesktopHoldingsTable
            grandTotalValue={grandTotalValue}
            totals={totals}
          />
          <MobileHoldingsList
            grandTotalValue={grandTotalValue}
            totals={totals}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No positions.</p>
      )}
    </section>
  );
}
