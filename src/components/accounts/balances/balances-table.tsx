import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  BalanceGroup,
  BalanceRow,
  SecondaryColumn,
} from "@/components/accounts/types";
import { formatPrice, formatQuantity, formatUsd } from "@/lib/format";

function DesktopTable({
  rows,
  total,
  secondaryColumn,
}: {
  rows: BalanceRow[];
  total: number;
  secondaryColumn: SecondaryColumn;
}) {
  const secondaryRight = secondaryColumn.align === "right";

  return (
    <div className="hidden sm:block">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[16%]" />
          <col className="w-[20%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent [&>th]:text-xs [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground">
            <TableHead>Asset</TableHead>
            <TableHead className={secondaryRight ? "text-right" : undefined}>
              {secondaryColumn.header}
            </TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>{row.symbol}</TableCell>
              <TableCell
                className={
                  secondaryRight ? "text-right tabular-nums" : undefined
                }
              >
                {row.secondary}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQuantity(row.amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPrice(row.priceUsd)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatUsd(row.valueUsd)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-muted/50">
            <TableCell colSpan={4}>Total</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatUsd(total)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function MobileList({
  rows,
  total,
  secondaryColumn,
}: {
  rows: BalanceRow[];
  total: number;
  secondaryColumn: SecondaryColumn;
}) {
  return (
    <ul className="divide-y sm:hidden">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{row.symbol}</span>
            <span className="font-medium tabular-nums">
              {formatUsd(row.valueUsd)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
            <span>
              {secondaryColumn.mobileLabel
                ? `${secondaryColumn.mobileLabel} ${row.secondary}`
                : row.secondary}
            </span>
            <span className="tabular-nums">
              {formatQuantity(row.amount)} @ {formatPrice(row.priceUsd)}
            </span>
          </div>
        </li>
      ))}
      <li className="flex items-baseline justify-between gap-4 bg-muted/50 px-4 py-3 font-medium">
        <span>Total</span>
        <span className="font-semibold tabular-nums">{formatUsd(total)}</span>
      </li>
    </ul>
  );
}

/**
 * Per-group holdings for an account details page: a header (address or account
 * label, with an optional secondary identifier) followed by its assets — a
 * columnar table on desktop and a stacked list on mobile, each capped with a
 * Total row.
 *
 * Source-agnostic: callers normalize their balances into {@link BalanceGroup}s
 * and supply the {@link SecondaryColumn} descriptor for the source-specific
 * second column (chain, cost basis, etc.).
 */
export function BalancesTable({
  group,
  secondaryColumn,
}: {
  group: BalanceGroup;
  secondaryColumn: SecondaryColumn;
}) {
  const hasRows = group.rows.length > 0;

  return (
    <section className="overflow-hidden rounded-lg border">
      <div className="flex items-baseline justify-between gap-4 border-b bg-muted/50 px-4 py-3 font-medium">
        <span>{group.title}</span>
        {group.subtitle ? (
          <span className="text-right text-sm font-normal text-muted-foreground">
            {group.subtitle}
          </span>
        ) : null}
      </div>
      {hasRows ? (
        <>
          <DesktopTable
            rows={group.rows}
            total={group.total}
            secondaryColumn={secondaryColumn}
          />
          <MobileList
            rows={group.rows}
            total={group.total}
            secondaryColumn={secondaryColumn}
          />
        </>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {group.emptyMessage}
        </p>
      )}
    </section>
  );
}
