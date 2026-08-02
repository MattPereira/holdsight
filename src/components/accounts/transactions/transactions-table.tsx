import { Badge } from "@/components/ui/badge";
import {
  formatAsset,
  Leg,
  transactionLegs,
} from "@/components/accounts/transactions/transaction-legs";
import { formatPrice, formatSignedUsd, formatUsd } from "@/lib/format";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import { TRADE_JOURNAL_REASON_LABELS } from "@/lib/journal/transaction-entry-labels";

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

function perpSecondaryLabel(
  transaction: InvestmentTransactionListItem,
): string | null {
  const amount = formatAsset(transaction);
  const fee = transaction.feeAmount === null
    ? null
    : `fee ${formatUsd(Math.abs(transaction.feeAmount))}`;

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

function reasonLabelFor(
  transaction: InvestmentTransactionListItem,
): string | null {
  const reason = transaction.journalSummary?.tradeReason;
  return reason ? TRADE_JOURNAL_REASON_LABELS[reason] : null;
}

export function TransactionsTable({
  transactions,
  onEditJournal,
  emptyMessage = "No transactions yet. Refresh to load.",
  timeZone,
}: {
  transactions: InvestmentTransactionListItem[];
  onEditJournal: (transaction: InvestmentTransactionListItem) => void;
  emptyMessage?: string;
  timeZone?: string;
}) {
  if (transactions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  const transactionDateFormat = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const transactionTimeFormat = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <ul className="divide-y">
      {transactions.map((transaction) => {
        const reasonLabel = reasonLabelFor(transaction);
        const executedAt = new Date(transaction.executedAt);
        return (
          <li key={transaction.id}>
            <button
              type="button"
              onClick={() => onEditJournal(transaction)}
              className="flex w-full items-start gap-1 px-5 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base">
                  {transaction.displayType === "perp_event"
                    ? perpActionLabel(transaction)
                    : transaction.accountLabel ?? "—"}
                </span>
                <span className="text-sm text-muted-foreground">
                  {transaction.displayType === "perp_event"
                    ? `${transaction.accountLabel ?? "—"} · ${transactionDateFormat.format(executedAt)}`
                    : transactionDateFormat.format(executedAt)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {transactionTimeFormat.format(executedAt)}
                </span>
                {transaction.displayType === "perp_event" ? (
                  // This line joins position size, entry/exit prices, PnL and
                  // fees into one string. Rather than split it apart, the whole
                  // line is marked: it over-blurs the prices, which is the safe
                  // direction to err in.
                  <span
                    data-sensitive
                    className="text-xs text-muted-foreground"
                  >
                    {perpSecondaryLabel(transaction)}
                  </span>
                ) : null}
              </div>

              <div className="ml-auto flex flex-col items-end gap-1">
                {transactionLegs(transaction).map((leg, i) => (
                  <Leg key={i} leg={leg} />
                ))}
                {reasonLabel ? (
                  <Badge variant="secondary">{reasonLabel}</Badge>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
