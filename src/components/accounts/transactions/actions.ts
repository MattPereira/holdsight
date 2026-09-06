"use server";

import { revalidatePath } from "next/cache";

import {
  authorizeViewedAccount,
  writableViewedAccountId,
} from "@/lib/auth/authorize";
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

const SIGNED_OUT_MESSAGE = "You must be signed in to manage journal entries.";

function revalidateTransactionJournalPaths(): void {
  revalidatePath("/");
  revalidatePath("/wallets");
  revalidatePath("/exchange");
  revalidatePath("/brokerages");
}

export async function getTransactionJournalEntry(
  transactionId: string,
): Promise<TransactionJournalActionResult> {
  const authorization = await authorizeViewedAccount("read");
  if (authorization.status !== "authorized") {
    return {
      entry: null,
      error: "You must be signed in to view journal entries.",
    };
  }

  const entry = await getUserInvestmentTransactionJournalEntry(
    authorization.userId,
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
  const userId = await writableViewedAccountId();
  if (!userId) {
    return { status: "error" as const, message: SIGNED_OUT_MESSAGE };
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
  const userId = await writableViewedAccountId();
  if (!userId) return { entry: null, error: SIGNED_OUT_MESSAGE };

  await removeUserInvestmentTransactionJournalEntry(userId, transactionId);
  revalidateTransactionJournalPaths();

  return { entry: null, error: null };
}
