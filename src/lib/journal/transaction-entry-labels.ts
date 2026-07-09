/**
 * Source of truth for the trade journal vocabulary. Plain `as const` arrays
 * rather than Postgres enums so adding, removing, or renaming a tag is a code
 * change + deploy with no migration — the columns are `text`/`text[]` and the
 * app validates against these sets at the API boundary. Kept in a client-safe
 * module (no `server-only`) so the editor sheet, the inline list summary, and
 * the server validation in `journal.ts` all read the same lists.
 */

export const TRADE_JOURNAL_REASONS = [
  // Entries
  "dip_buy",
  "breakout_buy",
  // P&L exits
  "take_profit",
  "stop_loss",
  // Sizing / portfolio
  "rebalance",
  // Other
  "thesis_change",
  "cash_raise",
] as const;

// Affective state in the moment of the trade only. Directional market bias is
// captured separately as a numeric score, rather than mixed into this list.
export const TRADE_JOURNAL_EMOTIONS = [
  "calm",
  "cautious",
  "panicked",
  "fomo",
  "frustrated",
  "euphoric",
] as const;

export type TradeJournalReason = (typeof TRADE_JOURNAL_REASONS)[number];
export type TradeJournalEmotion = (typeof TRADE_JOURNAL_EMOTIONS)[number];

/** Human-readable labels. Key order mirrors the source-of-truth arrays. */
export const TRADE_JOURNAL_REASON_LABELS: Record<TradeJournalReason, string> = {
  dip_buy: "Dip buy",
  breakout_buy: "Breakout buy",
  take_profit: "Take profit",
  stop_loss: "Stop loss",
  rebalance: "Rebalance port",
  thesis_change: "Thesis change",
  cash_raise: "Raise cash",
};

export const TRADE_JOURNAL_EMOTION_LABELS: Record<TradeJournalEmotion, string> =
  {
    calm: "Calm",
    cautious: "Cautious",
    panicked: "Panicked",
    fomo: "FOMO",
    frustrated: "Frustrated",
    euphoric: "Euphoric",
  };

export const TRADE_JOURNAL_REASON_OPTIONS = TRADE_JOURNAL_REASONS.map(
  (key) =>
    [key, TRADE_JOURNAL_REASON_LABELS[key]] as [TradeJournalReason, string],
);

export const TRADE_JOURNAL_EMOTION_OPTIONS = TRADE_JOURNAL_EMOTIONS.map(
  (key) =>
    [key, TRADE_JOURNAL_EMOTION_LABELS[key]] as [TradeJournalEmotion, string],
);
