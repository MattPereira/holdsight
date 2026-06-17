import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
  const total = accountTotal(balances);

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
              <TableCell className="font-normal">{balance.symbol}</TableCell>
              <TableCell className="text-right font-normal tabular-nums">
                {formatCostBasis(balance.costBasisUsd)}
              </TableCell>
              <TableCell className="text-right font-normal tabular-nums">
                {amountFormat.format(balance.amount)}
              </TableCell>
              <TableCell className="text-right font-normal tabular-nums">
                {priceFormat.format(balance.priceUsd)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatUsd(balance.valueUsd)}
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

function MobileList({ balances }: { balances: BrokerageBalance[] }) {
  const total = accountTotal(balances);

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
      <li className="flex items-baseline justify-between gap-4 bg-muted/50 px-4 py-3 font-medium">
        <span>Total</span>
        <span className="font-semibold tabular-nums">{formatUsd(total)}</span>
      </li>
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
  const institution = account.institutionName ?? account.brokerage;
  const label = account.label ?? institution;
  const secondaryInstitution = institution !== label ? institution : null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 px-2">
        <span className="text-sm font-medium">{label}</span>
        {secondaryInstitution ? (
          <span className="text-right text-sm font-normal text-muted-foreground">
            {secondaryInstitution}
          </span>
        ) : null}
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
