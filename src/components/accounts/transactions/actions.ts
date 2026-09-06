"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";

import { authorizeViewedAccount } from "@/lib/auth/authorize";
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

/**
 * The account a journal write may touch, or the signed-out message. A member
 * aiming at the other account gets `forbidden()` — a real 403 — rather than a
 * value, so nothing below can quietly write the entry into the actor's own
 * account instead (ADR 0005).
 */
async function writableAccount(): Promise<
  { writable: true; userId: string } | { writable: false; message: string }
> {
  const authorization = await authorizeViewedAccount("write");
  if (authorization.status === "forbidden") forbidden();
  if (authorization.status === "unauthenticated") {
    return { writable: false, message: SIGNED_OUT_MESSAGE };
  }

  return { writable: true, userId: authorization.userId };
}

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
  const account = await writableAccount();
  if (!account.writable) {
    return { status: "error" as const, message: account.message };
  }

  const result = await saveUserInvestmentTransactionJournalEntry(
    account.userId,
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
  const account = await writableAccount();
  if (!account.writable) return { entry: null, error: account.message };

  await removeUserInvestmentTransactionJournalEntry(
    account.userId,
    transactionId,
  );
  revalidateTransactionJournalPaths();

  return { entry: null, error: null };
}
