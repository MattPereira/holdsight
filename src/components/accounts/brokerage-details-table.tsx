import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CurrentBrokerageAccount } from "@/lib/brokerage/balances";
import type { BrokerageBalance } from "@/lib/brokerage/types";

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

const amountFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

function formatUsd(value: number) {
  return usdFormat.format(value);
}

function formatCostBasis(value: number | undefined) {
  return value === undefined ? "—" : usdFormat.format(value);
}

function balanceKey(balance: BrokerageBalance, i: number): string {
  return balance.sourceBalanceId ?? `${balance.symbol}-${i}`;
}

function accountTotal(balances: BrokerageBalance[]): number {
  return balances.reduce((sum, balance) => sum + balance.valueUsd, 0);
}

function DesktopTable({ balances }: { balances: BrokerageBalance[] }) {
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
            <TableHead className="text-right">Cost Basis</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {balances.map((balance, i) => (
            <TableRow key={balanceKey(balance, i)}>
              <TableCell className="font-medium">{balance.symbol}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatCostBasis(balance.costBasisUsd)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {amountFormat.format(balance.amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {priceFormat.format(balance.priceUsd)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatUsd(balance.valueUsd)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MobileList({ balances }: { balances: BrokerageBalance[] }) {
  return (
    <ul className="divide-y rounded-lg border sm:hidden">
      {balances.map((balance, i) => (
        <li
          key={balanceKey(balance, i)}
          className="flex flex-col gap-2 px-4 py-3"
        >
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{balance.symbol}</span>
            <span className="font-medium tabular-nums">
              {formatUsd(balance.valueUsd)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
            <span>Cost {formatCostBasis(balance.costBasisUsd)}</span>
            <span className="tabular-nums">
              {amountFormat.format(balance.amount)} @{" "}
              {priceFormat.format(balance.priceUsd)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Per-account holdings for the brokerage page: an institution/account header
 * with its total, followed by its holdings. Mirrors AccountDetailsTable but
 * shows cost basis (Plaid provides it) where EVM shows the chain.
 */
export function BrokerageDetailsTable({
  account,
}: {
  account: CurrentBrokerageAccount;
}) {
  const { balances } = account;
  const heading = account.label ?? account.institutionName ?? account.brokerage;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 px-2">
        <span className="text-sm font-medium">
          {heading}
          {account.institutionName && account.label ? (
            <span className="ml-2 text-muted-foreground">
              {account.institutionName}
            </span>
          ) : null}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {formatUsd(accountTotal(balances))}
        </span>
      </div>
      {balances.length > 0 ? (
        <>
          <DesktopTable balances={balances} />
          <MobileList balances={balances} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {account.syncStatus === "error"
            ? (account.syncErrorMessage ?? "Sync failed.")
            : "No holdings. Refresh to load."}
        </p>
      )}
    </section>
  );
}
