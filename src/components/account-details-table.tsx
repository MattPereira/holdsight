import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { walletTotal } from "@/lib/portfolio/asset-totals";
import type { Position, PositionsResult } from "@/lib/portfolio/types";

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

const amountFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

function formatUsd(value: number) {
  return usdFormat.format(value);
}

function formatPrice(price: number) {
  return price !== 0 && Math.abs(price) < 1
    ? subDollarPriceFormat.format(price)
    : priceFormat.format(price);
}

function shortenAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function statusMessage(result: PositionsResult): string {
  switch (result.status) {
    case "indexing":
      return "Indexing...";
    case "rate_limited":
      return "Rate limited. Wait a moment before reloading.";
    case "error":
      return result.message;
    case "ready":
      return "No positions.";
  }
}

function positionKey(position: Position, i: number): string {
  return (
    position.sourcePositionId ?? `${position.symbol}-${position.chainId}-${i}`
  );
}

function DesktopTable({ positions }: { positions: Position[] }) {
  return (
    <div className="hidden overflow-hidden rounded-lg border sm:block">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[16%]" />
          <col className="w-[20%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead>Asset</TableHead>
            <TableHead>Chain</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position, i) => (
            <TableRow key={positionKey(position, i)}>
              <TableCell className="font-medium">{position.symbol}</TableCell>
              <TableCell className="text-muted-foreground">
                {position.chainId}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {amountFormat.format(position.amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatPrice(position.priceUsd)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatUsd(position.valueUsd)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MobileList({ positions }: { positions: Position[] }) {
  return (
    <ul className="divide-y rounded-lg border sm:hidden">
      {positions.map((position, i) => (
        <li
          key={positionKey(position, i)}
          className="flex flex-col gap-2 px-4 py-3"
        >
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{position.symbol}</span>
            <span className="font-medium tabular-nums">
              {formatUsd(position.valueUsd)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
            <span>{position.chainId}</span>
            <span className="tabular-nums">
              {amountFormat.format(position.amount)} @{" "}
              {formatPrice(position.priceUsd)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Per-address holdings for an account details page: an address header with its
 * total, followed by its assets — a columnar table on desktop and a stacked
 * list on mobile.
 *
 * Intentionally self-contained — it owns its own formatters and markup so a
 * rewrite of the aggregate summary display can never take it down with it.
 */
export function AccountDetailsTable({ result }: { result: PositionsResult }) {
  const hasPositions =
    result.status === "ready" && result.positions.length > 0;
  const total = walletTotal(result);

  // A ready-but-empty address has nothing worth showing.
  if (result.status === "ready" && result.positions.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 px-2">
        <span className="font-mono text-sm font-medium">
          {shortenAddress(result.address)}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {formatUsd(total)}
        </span>
      </div>
      {hasPositions ? (
        <>
          <DesktopTable positions={result.positions} />
          <MobileList positions={result.positions} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{statusMessage(result)}</p>
      )}
    </section>
  );
}
