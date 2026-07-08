"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/auth/session";
import {
  getUserInvestmentTransactionJournalEntry,
  removeUserInvestmentTransactionJournalEntry,
  saveUserInvestmentTransactionJournalEntry,
  serializeTradeJournalEntry,
  type TradeJournalEntryInput,
  type TransactionJournalEntry,
} from "@/lib/journal/transaction-entry";

export type TransactionJournalActionResult = {
  entry: TransactionJournalEntry | null;
  error: string | null;
};

export type SaveTransactionJournalActionResult =
  | { status: "saved"; entry: TransactionJournalEntry | null }
  | { status: "conflict"; entry: TransactionJournalEntry }
  | { status: "error"; message: string };

function revalidateTransactionJournalPaths(): void {
  revalidatePath("/");
  revalidatePath("/wallets");
  revalidatePath("/exchange");
  revalidatePath("/brokerages");
}

export async function getTransactionJournalEntry(
  transactionId: string,
): Promise<TransactionJournalActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      entry: null,
      error: "You must be signed in to view journal entries.",
    };
  }

  const entry = await getUserInvestmentTransactionJournalEntry(
    userId,
    transactionId,
  );
  return { entry: entry ? serializeTradeJournalEntry(entry) : null, error: null };
}

export async function saveTransactionJournalEntry(
  transactionId: string,
  input: TradeJournalEntryInput,
  expectedUpdatedAt: string | null,
  overwrite = false,
): Promise<SaveTransactionJournalActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      status: "error" as const,
      message: "You must be signed in to manage journal entries.",
    };
  }

  const result = await saveUserInvestmentTransactionJournalEntry(
    userId,
    transactionId,
    input,
    expectedUpdatedAt,
    overwrite,
  );
  if (result.status === "saved") revalidateTransactionJournalPaths();

  if (result.status === "error") return result;
  if (result.status === "conflict") {
    return { status: "conflict", entry: serializeTradeJournalEntry(result.entry) };
  }
  return {
    status: "saved",
    entry: result.entry ? serializeTradeJournalEntry(result.entry) : null,
  };
}

export async function removeTransactionJournalEntry(
  transactionId: string,
): Promise<TransactionJournalActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      entry: null,
      error: "You must be signed in to manage journal entries.",
    };
  }

  await removeUserInvestmentTransactionJournalEntry(userId, transactionId);
  revalidateTransactionJournalPaths();

  return { entry: null, error: null };
}
