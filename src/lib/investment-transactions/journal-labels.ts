import type {
  TradeJournalEmotion,
  TradeJournalReason,
} from "@/lib/investment-transactions/journal";

/**
 * Human-readable labels for the trade journal enums. Kept in a client-safe
 * module (no `server-only`) so both the editor sheet and the inline list
 * summary can render them. Key order mirrors the database enum order.
 */
export const TRADE_JOURNAL_REASON_LABELS: Record<TradeJournalReason, string> = {
  risk_reduction: "Risk reduction",
  dip_buy: "Dip buy",
  breakout_buy: "Breakout buy",
  take_profit: "Take profit",
  stop_loss: "Stop loss",
  panic_sell: "Panic sell",
  fomo: "FOMO",
  rebalance: "Rebalance",
  thesis_change: "Thesis change",
  cash_raise: "Cash raise",
};

export const TRADE_JOURNAL_EMOTION_LABELS: Record<TradeJournalEmotion, string> =
  {
    calm: "Calm",
    confident: "Confident",
    uncertain: "Uncertain",
    fearful: "Fearful",
    greedy: "Greedy",
    fomo: "FOMO",
    frustrated: "Frustrated",
    patient: "Patient",
    impulsive: "Impulsive",
    disciplined: "Disciplined",
    stressed: "Stressed",
    excited: "Excited",
    regretful: "Regretful",
    neutral: "Neutral",
  };

export const TRADE_JOURNAL_REASON_OPTIONS = Object.entries(
  TRADE_JOURNAL_REASON_LABELS,
) as [TradeJournalReason, string][];

export const TRADE_JOURNAL_EMOTION_OPTIONS = Object.entries(
  TRADE_JOURNAL_EMOTION_LABELS,
) as [TradeJournalEmotion, string][];
