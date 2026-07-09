import { cn } from "@/lib/utils";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const amountFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

export type LegDirection = "in" | "out" | "neutral";

export type TransactionLeg = {
  direction: LegDirection;
  label: string;
  signed?: boolean;
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

export function formatAsset(
  transaction: InvestmentTransactionListItem,
): string | null {
  if (transaction.baseAmount === null || !transaction.baseAssetSymbol) {
    return null;
  }
  return `${amountFormat.format(Math.abs(transaction.baseAmount))} ${transaction.baseAssetSymbol}`;
}

function formatQuoteAsset(
  transaction: InvestmentTransactionListItem,
): string | null {
  if (transaction.quoteAmount === null || !transaction.quoteAssetSymbol) {
    return null;
  }
  return `${amountFormat.format(Math.abs(transaction.quoteAmount))} ${transaction.quoteAssetSymbol}`;
}

function formatCash(transaction: InvestmentTransactionListItem): string | null {
  return transaction.valueUsd === null
    ? null
    : usdFormat.format(Math.abs(transaction.valueUsd));
}

export function formatSignedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${usdFormat.format(Math.abs(value))}`;
}

function perpPrimaryValue(
  transaction: InvestmentTransactionListItem,
): TransactionLeg[] {
  if (
    transaction.perpEventType === "open" ||
    transaction.perpEventType === "increase"
  ) {
    return transaction.valueUsd === null
      ? []
      : [
          {
            direction: "in",
            label: usdFormat.format(Math.abs(transaction.valueUsd)),
          },
        ];
  }

  if (
    transaction.perpEventType === "decrease" ||
    transaction.perpEventType === "close"
  ) {
    const pnl = transaction.netPnlUsd;
    if (pnl === null || pnl === undefined) return [];
    return [
      {
        direction: pnl < 0 ? "out" : pnl > 0 ? "in" : "neutral",
        label: formatSignedUsd(pnl),
        signed: true,
      },
    ];
  }

  return [];
}

// Trades have two legs (asset in/out and the opposing cash leg); everything
// else is a single movement whose direction comes from the transaction side.
export function transactionLegs(
  transaction: InvestmentTransactionListItem,
): TransactionLeg[] {
  if (transaction.displayType === "perp_event") {
    return perpPrimaryValue(transaction);
  }

  const asset = formatAsset(transaction);
  const cash = formatCash(transaction);

  // A swap moves two assets: the received (base) leg in, the sent (quote) leg
  // out. Fall back to the cash value when the opposing asset wasn't captured.
  if (transaction.side === "swap") {
    const sent = formatQuoteAsset(transaction) ?? cash;
    return [
      ...(asset ? [{ direction: "in" as const, label: asset }] : []),
      ...(sent ? [{ direction: "out" as const, label: sent }] : []),
    ];
  }

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

export function Leg({ leg }: { leg: TransactionLeg }) {
  return (
    <span
      className={cn(
        "text-sm font-medium tabular-nums",
        legClassName[leg.direction],
      )}
    >
      {leg.signed ? "" : legSign[leg.direction]}
      {leg.label}
    </span>
  );
}
