import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentTransactionJournalEntries,
  investmentTransactionJournalEntryImages,
  investmentTransactions,
} from "@/db/schema/investment-transactions";
import { enqueueBlobDeletion } from "@/lib/blob/deletion-jobs";
import {
  TRADE_JOURNAL_EMOTIONS,
  TRADE_JOURNAL_REASONS,
  type TradeJournalEmotion,
  type TradeJournalReason,
} from "@/lib/investment-transactions/journal-labels";
import type {
  InvestmentTransactionListItem,
  TradeJournalSummary,
} from "@/lib/investment-transactions/list-item";

const MAX_NOTE_LENGTH = 10_000;

// Re-exported so existing importers of these from the server module keep working;
// the vocabulary itself now lives in the client-safe journal-labels module.
export {
  TRADE_JOURNAL_EMOTIONS,
  TRADE_JOURNAL_REASONS,
} from "@/lib/investment-transactions/journal-labels";
export type {
  TradeJournalEmotion,
  TradeJournalReason,
} from "@/lib/investment-transactions/journal-labels";

export type TradeJournalEntryInput = {
  note?: string | null;
  tradeReason?: TradeJournalReason | null;
  emotions?: TradeJournalEmotion[];
  marketBias?: number | null;
};

export type TradeJournalEntryRow = {
  id: string;
  transactionId: string;
  note: string | null;
  tradeReason: TradeJournalReason | null;
  emotions: TradeJournalEmotion[];
  marketBias: number | null;
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
    // Columns are plain `text`/`text[]`; values are constrained to the vocabulary
    // by validateJournalEntryInput on write, so narrowing on read is safe.
    tradeReason: row.tradeReason as TradeJournalReason | null,
    emotions: row.emotions as TradeJournalEmotion[],
    marketBias: row.marketBias,
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

function validateMarketBias(
  marketBias: TradeJournalEntryInput["marketBias"],
): { error: string } | { value: number | null } {
  if (marketBias == null) return { value: null };
  if (!Number.isInteger(marketBias) || marketBias < 1 || marketBias > 10) {
    return { error: "Market bias must be a whole number from 1 to 10." };
  }
  return { value: marketBias };
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
        marketBias: number | null;
      };
    } {
  const tradeReason = validateTradeReason(input.tradeReason);
  if ("error" in tradeReason) return tradeReason;

  const emotions = validateEmotions(input.emotions);
  if ("error" in emotions) return emotions;

  const marketBias = validateMarketBias(input.marketBias);
  if ("error" in marketBias) return marketBias;

  return {
    values: {
      note: normalizeNote(input.note),
      tradeReason: tradeReason.value,
      emotions: emotions.value,
      marketBias: marketBias.value,
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
      marketBias: investmentTransactionJournalEntries.marketBias,
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
      {
        tradeReason: row.tradeReason as TradeJournalReason | null,
        marketBias: row.marketBias,
      },
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
  // The image table cascade-deletes with the entry, which would drop the Blob
  // pathnames before anything records them. Collect them inside the same
  // transaction, delete the entry, then queue the orphaned Blobs for cleanup.
  const blobPathnames = await db.transaction(async (tx) => {
    const images = await tx
      .select({
        blobPathname: investmentTransactionJournalEntryImages.blobPathname,
      })
      .from(investmentTransactionJournalEntryImages)
      .innerJoin(
        investmentTransactionJournalEntries,
        eq(
          investmentTransactionJournalEntries.id,
          investmentTransactionJournalEntryImages.journalEntryId,
        ),
      )
      .where(
        and(
          eq(investmentTransactionJournalEntryImages.userId, userId),
          eq(
            investmentTransactionJournalEntries.transactionId,
            transactionId,
          ),
        ),
      );

    await tx
      .delete(investmentTransactionJournalEntries)
      .where(
        and(
          eq(investmentTransactionJournalEntries.userId, userId),
          eq(investmentTransactionJournalEntries.transactionId, transactionId),
        ),
      );

    return images.map(({ blobPathname }) => blobPathname);
  });

  // Enqueue failures must not fail the user's delete; the Blobs would simply be
  // left for a future reconciliation sweep instead.
  await Promise.all(
    blobPathnames.map(async (blobPathname) => {
      try {
        await enqueueBlobDeletion(blobPathname);
      } catch (enqueueError) {
        console.error(
          "Failed to enqueue journal image Blob cleanup",
          enqueueError,
        );
      }
    }),
  );
}
