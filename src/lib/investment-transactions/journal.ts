import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentTransactionJournalEntries,
  investmentTransactions,
  tradeJournalEmotion,
  tradeJournalReason,
} from "@/db/schema/investment-transactions";
import type {
  InvestmentTransactionListItem,
  TradeJournalSummary,
} from "@/lib/investment-transactions/list-item";

const MAX_NOTE_LENGTH = 10_000;

export const TRADE_JOURNAL_REASONS = tradeJournalReason.enumValues;
export const TRADE_JOURNAL_EMOTIONS = tradeJournalEmotion.enumValues;

export type TradeJournalReason = (typeof TRADE_JOURNAL_REASONS)[number];
export type TradeJournalEmotion = (typeof TRADE_JOURNAL_EMOTIONS)[number];

export type TradeJournalEntryInput = {
  note?: string | null;
  tradeReason?: TradeJournalReason | null;
  emotions?: TradeJournalEmotion[];
  confidence?: number | null;
};

export type TradeJournalEntryRow = {
  id: string;
  transactionId: string;
  note: string | null;
  tradeReason: TradeJournalReason | null;
  emotions: TradeJournalEmotion[];
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const TRADE_JOURNAL_REASON_SET = new Set<string>(TRADE_JOURNAL_REASONS);
const TRADE_JOURNAL_EMOTION_SET = new Set<string>(TRADE_JOURNAL_EMOTIONS);

function toJournalEntryRow(
  row: typeof investmentTransactionJournalEntries.$inferSelect,
): TradeJournalEntryRow {
  return {
    id: row.id,
    transactionId: row.transactionId,
    note: row.note,
    tradeReason: row.tradeReason,
    emotions: row.emotions,
    confidence: row.confidence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_NOTE_LENGTH);
}

function validateTradeReason(
  tradeReason: TradeJournalEntryInput["tradeReason"],
): { error: string } | { value: TradeJournalReason | null } {
  if (tradeReason == null) return { value: null };
  if (!TRADE_JOURNAL_REASON_SET.has(tradeReason)) {
    return { error: "Select a valid trade reason." };
  }
  return { value: tradeReason };
}

function validateEmotions(
  emotions: TradeJournalEntryInput["emotions"],
): { error: string } | { value: TradeJournalEmotion[] } {
  if (!emotions) return { value: [] };

  const nextEmotions: TradeJournalEmotion[] = [];
  const seen = new Set<TradeJournalEmotion>();
  for (const emotion of emotions) {
    if (!TRADE_JOURNAL_EMOTION_SET.has(emotion)) {
      return { error: "Select valid emotions." };
    }
    if (!seen.has(emotion)) {
      seen.add(emotion);
      nextEmotions.push(emotion);
    }
  }

  return { value: nextEmotions };
}

function validateConfidence(
  confidence: TradeJournalEntryInput["confidence"],
): { error: string } | { value: number | null } {
  if (confidence == null) return { value: null };
  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 10) {
    return { error: "Confidence must be a whole number from 1 to 10." };
  }
  return { value: confidence };
}

function validateJournalEntryInput(
  input: TradeJournalEntryInput,
):
  | { error: string }
  | {
      values: {
        note: string | null;
        tradeReason: TradeJournalReason | null;
        emotions: TradeJournalEmotion[];
        confidence: number | null;
      };
    } {
  const tradeReason = validateTradeReason(input.tradeReason);
  if ("error" in tradeReason) return tradeReason;

  const emotions = validateEmotions(input.emotions);
  if ("error" in emotions) return emotions;

  const confidence = validateConfidence(input.confidence);
  if ("error" in confidence) return confidence;

  return {
    values: {
      note: normalizeNote(input.note),
      tradeReason: tradeReason.value,
      emotions: emotions.value,
      confidence: confidence.value,
    },
  };
}

async function userOwnsTransaction(
  userId: string,
  transactionId: string,
): Promise<boolean> {
  const [transaction] = await db
    .select({ id: investmentTransactions.id })
    .from(investmentTransactions)
    .where(
      and(
        eq(investmentTransactions.id, transactionId),
        eq(investmentTransactions.userId, userId),
      ),
    )
    .limit(1);

  return Boolean(transaction);
}

export async function getUserInvestmentTransactionJournalEntry(
  userId: string,
  transactionId: string,
): Promise<TradeJournalEntryRow | null> {
  const [entry] = await db
    .select()
    .from(investmentTransactionJournalEntries)
    .where(
      and(
        eq(investmentTransactionJournalEntries.userId, userId),
        eq(investmentTransactionJournalEntries.transactionId, transactionId),
      ),
    )
    .limit(1);

  return entry ? toJournalEntryRow(entry) : null;
}

export async function getUserInvestmentTransactionJournalEntries(
  userId: string,
  transactionIds: string[],
): Promise<TradeJournalEntryRow[]> {
  if (transactionIds.length === 0) return [];

  const rows = await db
    .select()
    .from(investmentTransactionJournalEntries)
    .where(
      and(
        eq(investmentTransactionJournalEntries.userId, userId),
        inArray(
          investmentTransactionJournalEntries.transactionId,
          transactionIds,
        ),
      ),
    );

  return rows.map(toJournalEntryRow);
}

/**
 * Returns a copy of the transactions with each item's {@link TradeJournalSummary}
 * attached, fetched in a single batched query keyed by transaction id.
 */
export async function withTransactionJournalSummaries(
  userId: string,
  transactions: InvestmentTransactionListItem[],
): Promise<InvestmentTransactionListItem[]> {
  if (transactions.length === 0) return transactions;

  const rows = await db
    .select({
      transactionId: investmentTransactionJournalEntries.transactionId,
      tradeReason: investmentTransactionJournalEntries.tradeReason,
      confidence: investmentTransactionJournalEntries.confidence,
    })
    .from(investmentTransactionJournalEntries)
    .where(
      and(
        eq(investmentTransactionJournalEntries.userId, userId),
        inArray(
          investmentTransactionJournalEntries.transactionId,
          transactions.map((transaction) => transaction.id),
        ),
      ),
    );

  const summaries = new Map<string, TradeJournalSummary>(
    rows.map((row) => [
      row.transactionId,
      { tradeReason: row.tradeReason, confidence: row.confidence },
    ]),
  );

  return transactions.map((transaction) => ({
    ...transaction,
    journalSummary: summaries.get(transaction.id) ?? null,
  }));
}

export async function saveUserInvestmentTransactionJournalEntry(
  userId: string,
  transactionId: string,
  input: TradeJournalEntryInput,
): Promise<{ entry: TradeJournalEntryRow | null; error: string | null }> {
  const result = validateJournalEntryInput(input);
  if ("error" in result) return { entry: null, error: result.error };

  if (!(await userOwnsTransaction(userId, transactionId))) {
    return { entry: null, error: "Transaction not found." };
  }

  const [entry] = await db
    .insert(investmentTransactionJournalEntries)
    .values({
      userId,
      transactionId,
      ...result.values,
    })
    .onConflictDoUpdate({
      target: investmentTransactionJournalEntries.transactionId,
      set: {
        ...result.values,
        updatedAt: new Date(),
      },
    })
    .returning();

  return { entry: entry ? toJournalEntryRow(entry) : null, error: null };
}

export async function removeUserInvestmentTransactionJournalEntry(
  userId: string,
  transactionId: string,
): Promise<void> {
  await db
    .delete(investmentTransactionJournalEntries)
    .where(
      and(
        eq(investmentTransactionJournalEntries.userId, userId),
        eq(investmentTransactionJournalEntries.transactionId, transactionId),
      ),
    );
}
