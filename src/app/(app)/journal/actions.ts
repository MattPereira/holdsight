"use server";

import { getCurrentUserId } from "@/lib/auth/session";
import {
  deleteJournalEntry as deleteInvestmentJournalEntry,
  getRecentJournalEntries as getRecentInvestmentJournalEntries,
  saveJournalEntry as persistJournalEntry,
  setHomeTimezone,
  type RecentJournalEntriesCursor,
  type SaveJournalResult,
} from "@/lib/investment-journal/journal";
import type { JournalPeriodType } from "@/lib/investment-journal/periods";

export async function confirmHomeTimezone(homeTimezone: string) {
  const userId = await getCurrentUserId();
  if (!userId) return { homeTimezone: null, error: "You must be signed in." };
  return setHomeTimezone(userId, homeTimezone);
}

export async function saveJournalEntry(input: {
  periodType: JournalPeriodType;
  periodStart: string;
  plan: string;
  reflection: string;
  entryId: string | null;
  expectedUpdatedAt: string | null;
  overwrite?: boolean;
}): Promise<SaveJournalResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { status: "error", message: "You must be signed in." };
  return persistJournalEntry(userId, {
    ...input,
    overwrite: input.overwrite === true,
  });
}

export async function deleteJournalEntry(
  entryId: string,
  periodType: JournalPeriodType,
) {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "You must be signed in." };
  return deleteInvestmentJournalEntry(userId, entryId, periodType);
}

export async function getRecentJournalEntries(
  periodType: JournalPeriodType,
  cursor?: RecentJournalEntriesCursor | null,
) {
  const userId = await getCurrentUserId();
  if (!userId) return { entries: [], nextCursor: null };
  return getRecentInvestmentJournalEntries(userId, periodType, cursor);
}
