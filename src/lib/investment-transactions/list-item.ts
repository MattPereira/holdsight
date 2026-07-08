import type {
  InvestmentTransactionKind,
  InvestmentTransactionSide,
  InvestmentTransactionStatus,
} from "@/lib/investment-transactions/ingestion";
import type { TradeJournalReason } from "@/lib/journal/transaction-entry";

/** Lightweight journal preview surfaced inline in the transactions list. */
export type TradeJournalSummary = {
  tradeReason: TradeJournalReason | null;
  marketBias: number | null;
};

export type TransactionExecutedAtRange = {
  start: Date;
  end: Date;
};

/** Transaction fields consumed by the shared account transaction UI. */
export type InvestmentTransactionListItem = {
  id: string;
  investmentAccountId: string;
  accountLabel: string | null;
  sourceTransactionId: string;
  sourceAccountId: string | null;
  executedAt: string;
  settledAt: string | null;
  kind: InvestmentTransactionKind;
  side: InvestmentTransactionSide;
  baseAssetSymbol: string | null;
  baseAssetId: string | null;
  baseAmount: number | null;
  quoteAssetSymbol: string | null;
  quoteAmount: number | null;
  priceQuote: number | null;
  valueUsd: number | null;
  feeAmount: number | null;
  feeAssetSymbol: string | null;
  status: InvestmentTransactionStatus;
  displayType?: "transaction" | "perp_event";
  perpEventType?: "open" | "increase" | "decrease" | "close";
  perpPositionSide?: "long" | "short";
  entryPrice?: number | null;
  exitPrice?: number | null;
  grossPnlUsd?: number | null;
  netPnlUsd?: number | null;
  journalSummary?: TradeJournalSummary | null;
};
