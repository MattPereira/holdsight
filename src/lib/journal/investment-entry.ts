import "server-only";

import { and, eq, gte, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentJournalEntries,
  userPreferences,
} from "@/db/schema/investment-journal";
import {
  canonicalPeriodStart,
  currentJournalPeriods,
  isCalendarDate,
  isJournalPeriodType,
  journalPeriodUtcRange,
  type JournalPeriodType,
} from "@/lib/journal/periods";
import type { InvestmentTransactionListItem } from "@/lib/investment-transactions/list-item";
import { getPortfolioTransactionsInRange } from "@/lib/portfolio/transactions";

export const MAX_JOURNAL_TEXT_LENGTH = 10_000;

export type InvestmentJournalEntry = {
  id: string;
  periodType: JournalPeriodType;
  periodStart: string;
  plan: string;
  reflection: string;
  updatedAt: string;
};

export type JournalWorkspace = {
  homeTimezone: string | null;
  timezoneLocked: boolean;
  entry: InvestmentJournalEntry | null;
  transactions: InvestmentTransactionListItem[];
};

export type SaveJournalResult =
  | { status: "saved"; entry: InvestmentJournalEntry }
  | { status: "conflict"; entry: InvestmentJournalEntry }
  | { status: "error"; message: string };

function serializeEntry(
  entry: typeof investmentJournalEntries.$inferSelect,
): InvestmentJournalEntry {
  return {
    id: entry.id,
    periodType: entry.periodType,
    periodStart: entry.periodStart,
    plan: entry.plan ?? "",
    reflection: entry.reflection ?? "",
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

export function todayInTimezone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function getJournalWorkspace(
  userId: string,
  periodType: JournalPeriodType,
  periodStart: string,
): Promise<JournalWorkspace> {
  const [preferences, entry, firstEntry] = await Promise.all([
    db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
      columns: { homeTimezone: true },
    }),
    db.query.investmentJournalEntries.findFirst({
      where: and(
        eq(investmentJournalEntries.userId, userId),
        eq(investmentJournalEntries.periodType, periodType),
        eq(investmentJournalEntries.periodStart, periodStart),
      ),
    }),
    db.query.investmentJournalEntries.findFirst({
      where: eq(investmentJournalEntries.userId, userId),
      columns: { id: true },
    }),
  ]);

  return {
    homeTimezone: preferences?.homeTimezone ?? null,
    timezoneLocked: Boolean(firstEntry),
    entry: entry ? serializeEntry(entry) : null,
    transactions: preferences?.homeTimezone
      ? await getPortfolioTransactionsInRange(
          userId,
          journalPeriodUtcRange(
            periodType,
            periodStart,
            preferences.homeTimezone,
          ),
        )
      : [],
  };
}

/**
 * The current daily, weekly, and monthly Investment Journal Entries for the
 * home page — only those with written Plan or Reflection text. Returns nothing
 * until the user has set a home timezone, since "current" is undefined without
 * it. Ordered daily → weekly → monthly.
 */
export async function getCurrentJournalEntries(
  userId: string,
): Promise<InvestmentJournalEntry[]> {
  const preferences = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
    columns: { homeTimezone: true },
  });
  if (!preferences?.homeTimezone) return [];

  const periods = currentJournalPeriods(
    todayInTimezone(preferences.homeTimezone),
  );
  const hasText = sql`(
    char_length(trim(coalesce(${investmentJournalEntries.plan}, ''))) > 0
    or char_length(trim(coalesce(${investmentJournalEntries.reflection}, ''))) > 0
  )`;

  const rows = await db
    .select()
    .from(investmentJournalEntries)
    .where(
      and(
        eq(investmentJournalEntries.userId, userId),
        or(
          ...periods.map((period) =>
            and(
              eq(investmentJournalEntries.periodType, period.periodType),
              eq(investmentJournalEntries.periodStart, period.periodStart),
            ),
          ),
        ),
        hasText,
      ),
    );

  const byKey = new Map(
    rows.map((row) => [`${row.periodType}:${row.periodStart}`, row]),
  );
  return periods
    .map((period) => byKey.get(`${period.periodType}:${period.periodStart}`))
    .filter((row) => row !== undefined)
    .map(serializeEntry);
}

/** Period starts (canonical dates) that already have an entry within [rangeStart, rangeEnd]. */
export async function getJournalEntryDatesInRange(
  userId: string,
  periodType: JournalPeriodType,
  rangeStart: string,
  rangeEnd: string,
): Promise<string[]> {
  if (!isJournalPeriodType(periodType)) return [];

  const rows = await db
    .select({ periodStart: investmentJournalEntries.periodStart })
    .from(investmentJournalEntries)
    .where(
      and(
        eq(investmentJournalEntries.userId, userId),
        eq(investmentJournalEntries.periodType, periodType),
        gte(investmentJournalEntries.periodStart, rangeStart),
        lte(investmentJournalEntries.periodStart, rangeEnd),
      ),
    );
  return rows.map((row) => row.periodStart);
}

export async function setHomeTimezone(
  userId: string,
  homeTimezone: string,
): Promise<{ homeTimezone: string | null; error: string | null }> {
  if (!isIanaTimezone(homeTimezone)) {
    return { homeTimezone: null, error: "Enter a valid IANA timezone." };
  }

  return db.transaction(async (tx) => {
    const existingEntry = await tx.query.investmentJournalEntries.findFirst({
      where: eq(investmentJournalEntries.userId, userId),
      columns: { id: true },
    });
    const preferences = await tx.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
    });

    if (existingEntry) {
      return preferences?.homeTimezone === homeTimezone
        ? { homeTimezone, error: null }
        : {
            homeTimezone: preferences?.homeTimezone ?? null,
            error: "Your home timezone is locked because a journal entry exists.",
          };
    }

    await tx
      .insert(userPreferences)
      .values({ userId, homeTimezone })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { homeTimezone, updatedAt: new Date() },
      });
    return { homeTimezone, error: null };
  });
}

export async function saveJournalEntry(
  userId: string,
  input: {
    periodType: JournalPeriodType;
    periodStart: string;
    plan: string;
    reflection: string;
    entryId: string | null;
    expectedUpdatedAt: string | null;
    overwrite: boolean;
  },
): Promise<SaveJournalResult> {
  if (!isJournalPeriodType(input.periodType)) {
    return {
      status: "error",
      message: "Choose a valid Journal Period type.",
    };
  }
  if (
    !isCalendarDate(input.periodStart) ||
    canonicalPeriodStart(input.periodType, input.periodStart) !==
      input.periodStart
  ) {
    return { status: "error", message: "Choose a valid Journal Period." };
  }
  if (
    input.plan.length > MAX_JOURNAL_TEXT_LENGTH ||
    input.reflection.length > MAX_JOURNAL_TEXT_LENGTH
  ) {
    return {
      status: "error",
      message: "Plan and Notes are limited to 10,000 characters each.",
    };
  }

  const preferences = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });
  if (!preferences) {
    return { status: "error", message: "Confirm your home timezone first." };
  }

  const values = {
    plan: input.plan || null,
    reflection: input.reflection || null,
    updatedAt: new Date(),
  };

  if (!input.entryId) {
    const [created] = await db
      .insert(investmentJournalEntries)
      .values({
        userId,
        periodType: input.periodType,
        periodStart: input.periodStart,
        ...values,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return { status: "saved", entry: serializeEntry(created) };
  } else {
    const conditions = [
      eq(investmentJournalEntries.id, input.entryId),
      eq(investmentJournalEntries.userId, userId),
      eq(investmentJournalEntries.periodType, input.periodType),
      eq(investmentJournalEntries.periodStart, input.periodStart),
    ];
    if (!input.overwrite) {
      if (!input.expectedUpdatedAt) {
        return { status: "error", message: "The journal version is missing." };
      }
      conditions.push(
        eq(investmentJournalEntries.updatedAt, new Date(input.expectedUpdatedAt)),
      );
    }
    const [updated] = await db
      .update(investmentJournalEntries)
      .set(values)
      .where(and(...conditions))
      .returning();
    if (updated) return { status: "saved", entry: serializeEntry(updated) };
  }

  const current = await db.query.investmentJournalEntries.findFirst({
    where: and(
      eq(investmentJournalEntries.userId, userId),
      eq(investmentJournalEntries.periodType, input.periodType),
      eq(investmentJournalEntries.periodStart, input.periodStart),
    ),
  });
  return current
    ? { status: "conflict", entry: serializeEntry(current) }
    : { status: "error", message: "The journal entry no longer exists." };
}

export async function deleteJournalEntry(
  userId: string,
  entryId: string,
  periodType: JournalPeriodType,
): Promise<{ error: string | null }> {
  if (!isJournalPeriodType(periodType)) {
    return { error: "Choose a valid Journal Period type." };
  }
  await db
    .delete(investmentJournalEntries)
    .where(
      and(
        eq(investmentJournalEntries.id, entryId),
        eq(investmentJournalEntries.userId, userId),
        eq(investmentJournalEntries.periodType, periodType),
      ),
    );
  return { error: null };
}
