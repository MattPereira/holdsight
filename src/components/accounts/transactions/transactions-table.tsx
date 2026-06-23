import { cn } from "@/lib/utils";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const amountFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

type LegDirection = "in" | "out" | "neutral";

type TransactionLeg = {
  direction: LegDirection;
  label: string;
};

const INBOUND_SIDES = new Set<InvestmentTransactionListItem["side"]>([
  "buy",
  "receive",
  "increase",
  "open",
]);

const OUTBOUND_SIDES = new Set<InvestmentTransactionListItem["side"]>([
  "sell",
  "send",
  "decrease",
  "close",
]);

function sideDirection(
  side: InvestmentTransactionListItem["side"],
): LegDirection {
  if (INBOUND_SIDES.has(side)) return "in";
  if (OUTBOUND_SIDES.has(side)) return "out";
  return "neutral";
}

function formatAsset(
  transaction: InvestmentTransactionListItem,
): string | null {
  if (transaction.baseAmount === null || !transaction.baseAssetSymbol) {
    return null;
  }
  return `${amountFormat.format(Math.abs(transaction.baseAmount))} ${transaction.baseAssetSymbol}`;
}

function formatCash(transaction: InvestmentTransactionListItem): string | null {
  return transaction.valueUsd === null
    ? null
    : usdFormat.format(Math.abs(transaction.valueUsd));
}

// Trades have two legs (asset in/out and the opposing cash leg); everything
// else is a single movement whose direction comes from the transaction side.
function transactionLegs(
  transaction: InvestmentTransactionListItem,
): TransactionLeg[] {
  const asset = formatAsset(transaction);
  const cash = formatCash(transaction);

  if (transaction.kind === "trade" && asset) {
    if (transaction.side === "buy") {
      return [
        { direction: "in", label: asset },
        ...(cash ? [{ direction: "out" as const, label: cash }] : []),
      ];
    }
    if (transaction.side === "sell") {
      return [
        { direction: "out", label: asset },
        ...(cash ? [{ direction: "in" as const, label: cash }] : []),
      ];
    }
  }

  const direction = sideDirection(transaction.side);
  const label = asset ?? cash;
  return label ? [{ direction, label }] : [];
}

const legClassName: Record<LegDirection, string> = {
  in: "text-emerald-600 dark:text-emerald-400",
  out: "text-red-600 dark:text-red-400",
  neutral: "text-foreground",
};

const legSign: Record<LegDirection, string> = {
  in: "+",
  out: "−",
  neutral: "",
};

function Leg({ leg }: { leg: TransactionLeg }) {
  return (
    <span
      className={cn(
        "text-sm font-medium tabular-nums",
        legClassName[leg.direction],
      )}
    >
      {legSign[leg.direction]}
      {leg.label}
    </span>
  );
}

export function TransactionsTable({
  transactions,
}: {
  transactions: InvestmentTransactionListItem[];
}) {
  if (transactions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        No transactions yet. Refresh to load.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {transactions.map((transaction) => (
        <li
          key={transaction.id}
          className="flex items-start justify-between gap-4 py-3"
        >
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {dateFormat.format(new Date(transaction.executedAt))}
            </span>
            <span className="text-sm font-medium">
              {transaction.accountLabel ?? "—"}
            </span>
          </div>
          <div className="flex flex-col items-end">
            {transactionLegs(transaction).map((leg, i) => (
              <Leg key={i} leg={leg} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
