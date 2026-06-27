import { RiPencilFill, RiPencilLine } from "@remixicon/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import { TRADE_JOURNAL_REASON_LABELS } from "@/lib/investment-transactions/journal-labels";

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const amountFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

const dateParts = new Intl.DateTimeFormat("en-US", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Renders "06/26/26 · 17:04" — Intl can't reliably emit this exact layout, so
// we assemble the parts ourselves.
function formatDate(date: Date): string {
  const parts = dateParts.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")} · ${get("hour")}:${get("minute")}`;
}

type LegDirection = "in" | "out" | "neutral";

type TransactionLeg = {
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

function formatAsset(
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

function formatSignedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${usdFormat.format(Math.abs(value))}`;
}

function formatPrice(value: number): string {
  return usdFormat.format(value);
}

function perpActionLabel(
  transaction: InvestmentTransactionListItem,
): string {
  const action =
    transaction.perpEventType === "open"
      ? "Opened"
      : transaction.perpEventType === "increase"
        ? "Increased"
        : transaction.perpEventType === "decrease"
          ? "Reduced"
          : transaction.perpEventType === "close"
            ? "Closed"
            : "Updated";
  const side = transaction.perpPositionSide ?? "position";
  return `${action} ${transaction.baseAssetSymbol ?? transaction.baseAssetId ?? "perp"} ${side}`;
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
      : [{ direction: "in", label: usdFormat.format(Math.abs(transaction.valueUsd)) }];
  }

  if (
    transaction.perpEventType === "decrease" ||
    transaction.perpEventType === "close"
  ) {
    const pnl = transaction.netPnlUsd;
    if (pnl === null || pnl === undefined) return [];
    return [{
      direction: pnl < 0 ? "out" : pnl > 0 ? "in" : "neutral",
      label: formatSignedUsd(pnl),
      signed: true,
    }];
  }

  return [];
}

function perpSecondaryLabel(
  transaction: InvestmentTransactionListItem,
): string | null {
  const amount = formatAsset(transaction);
  const fee = transaction.feeAmount === null
    ? null
    : `fee ${usdFormat.format(Math.abs(transaction.feeAmount))}`;

  if (
    transaction.perpEventType === "open" ||
    transaction.perpEventType === "increase"
  ) {
    const price = transaction.entryPrice === null || transaction.entryPrice === undefined
      ? null
      : `@ ${formatPrice(transaction.entryPrice)}`;
    return [amount, price, fee].filter(Boolean).join(" · ") || null;
  }

  const entry = transaction.entryPrice === null || transaction.entryPrice === undefined
    ? null
    : formatPrice(transaction.entryPrice);
  const exit = transaction.exitPrice === null || transaction.exitPrice === undefined
    ? null
    : formatPrice(transaction.exitPrice);
  const prices = entry && exit ? `entry ${entry} -> exit ${exit}` : null;
  const gross = transaction.grossPnlUsd === null || transaction.grossPnlUsd === undefined
    ? null
    : `gross ${formatSignedUsd(transaction.grossPnlUsd)}`;

  return [amount, prices, gross, fee].filter(Boolean).join(" · ") || null;
}

// Trades have two legs (asset in/out and the opposing cash leg); everything
// else is a single movement whose direction comes from the transaction side.
function transactionLegs(
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

function Leg({ leg }: { leg: TransactionLeg }) {
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

function JournalEditButton({
  transaction,
  onEditJournal,
}: {
  transaction: InvestmentTransactionListItem;
  onEditJournal: (transaction: InvestmentTransactionListItem) => void;
}) {
  const hasEntry = Boolean(transaction.journalSummary);
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label={hasEntry ? "Edit journal entry" : "Add journal entry"}
      className={cn("text-muted-foreground", hasEntry && "text-primary")}
      onClick={() => onEditJournal(transaction)}
    >
      {hasEntry ? <RiPencilFill /> : <RiPencilLine />}
    </Button>
  );
}

function reasonLabelFor(
  transaction: InvestmentTransactionListItem,
): string | null {
  const reason = transaction.journalSummary?.tradeReason;
  return reason ? TRADE_JOURNAL_REASON_LABELS[reason] : null;
}

export function TransactionsTable({
  transactions,
  onEditJournal,
}: {
  transactions: InvestmentTransactionListItem[];
  onEditJournal: (transaction: InvestmentTransactionListItem) => void;
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
      {transactions.map((transaction) => {
        const reasonLabel = reasonLabelFor(transaction);
        return (
          <li key={transaction.id} className="flex items-start gap-3 py-2.5">
            {/* Edit control anchored far left so it never drifts with label width. */}
            <JournalEditButton
              transaction={transaction}
              onEditJournal={onEditJournal}
            />

            <div className="flex min-w-0 flex-col">
              <span className="text-sm">
                {transaction.displayType === "perp_event"
                  ? perpActionLabel(transaction)
                  : transaction.accountLabel ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground">
                {transaction.displayType === "perp_event"
                  ? `${transaction.accountLabel ?? "—"} · ${formatDate(new Date(transaction.executedAt))}`
                  : formatDate(new Date(transaction.executedAt))}
              </span>
              {transaction.displayType === "perp_event" ? (
                <span className="text-xs text-muted-foreground">
                  {perpSecondaryLabel(transaction)}
                </span>
              ) : null}
            </div>

            {reasonLabel ? (
              <Badge variant="secondary" className="self-end">
                {reasonLabel}
              </Badge>
            ) : null}

            <div className="ml-auto flex flex-col items-end">
              {transactionLegs(transaction).map((leg, i) => (
                <Leg key={i} leg={leg} />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
