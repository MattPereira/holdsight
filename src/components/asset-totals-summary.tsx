import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssetTotal } from "@/lib/portfolio/asset-totals";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const percentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  style: "percent",
});

function PositionCardRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
}

function DesktopAssetTotalsTable({
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
            <TableHead className="text-right">Allocation</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {totals.map((total) => (
            <TableRow key={total.symbol}>
              <TableCell className="font-medium">{total.symbol}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {percentFormat.format(
                  grandTotalValue === 0 ? 0 : total.valueUsd / grandTotalValue,
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {usd.format(total.valueUsd)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MobileAssetTotalsList({
  grandTotalValue,
  totals,
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
}) {
  return (
    <ul className="divide-y rounded-lg border sm:hidden">
      {totals.map((total) => (
        <li key={total.symbol} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{total.symbol}</span>
            <span className="tabular-nums font-medium">
              {usd.format(total.valueUsd)}
            </span>
          </div>
          <PositionCardRow
            label="Portfolio"
            value={percentFormat.format(
              grandTotalValue === 0 ? 0 : total.valueUsd / grandTotalValue,
            )}
          />
        </li>
      ))}
    </ul>
  );
}

export function AssetTotalsSummary({
  grandTotalValue,
  totals,
}: {
  grandTotalValue: number;
  totals: AssetTotal[];
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-4">
      <div className="flex items-baseline justify-between gap-4 font-medium">
        <h2 className="text-base font-semibold">Total</h2>
        <span className="tabular-nums">{usd.format(grandTotalValue)}</span>
      </div>

      {totals.length > 0 ? (
        <>
          <DesktopAssetTotalsTable
            grandTotalValue={grandTotalValue}
            totals={totals}
          />
          <MobileAssetTotalsList
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
