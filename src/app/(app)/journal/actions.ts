"use server";

import { getCurrentUserId } from "@/lib/auth/session";
import {
  deleteDailyJournalEntry,
  saveDailyJournalEntry,
  setHomeTimezone,
  type SaveJournalResult,
} from "@/lib/investment-journal/journal";

export async function confirmHomeTimezone(homeTimezone: string) {
  const userId = await getCurrentUserId();
  if (!userId) return { homeTimezone: null, error: "You must be signed in." };
  return setHomeTimezone(userId, homeTimezone);
}

export async function saveJournalEntry(input: {
  periodStart: string;
  plan: string;
  reflection: string;
  entryId: string | null;
  expectedUpdatedAt: string | null;
  overwrite?: boolean;
}): Promise<SaveJournalResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { status: "error", message: "You must be signed in." };
  return saveDailyJournalEntry(userId, {
    ...input,
    overwrite: input.overwrite === true,
  });
}

export async function deleteJournalEntry(entryId: string) {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "You must be signed in." };
  return deleteDailyJournalEntry(userId, entryId);
}
