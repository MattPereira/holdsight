import "server-only";

import { and, eq, gte, lte, or } from "drizzle-orm";

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
  todayInTimezone,
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

/** A Journal Period the user can write into right now, with its entry if one
 * has been created. `entry` is null until the first save materializes a row. */
export type JournalSlot = {
  periodType: JournalPeriodType;
  periodStart: string;
  entry: InvestmentJournalEntry | null;
};

export type CurrentJournalSlots = {
  homeTimezone: string | null;
  slots: JournalSlot[];
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

export { todayInTimezone };

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
 * One slot per requested Journal Period type, each resolved to the period
 * containing today in the user's home timezone. Unlike a plain entry list this
 * always returns a slot for every requested type — the Portfolio page edits
 * these periods in place, so it needs the `periodStart` to write to even when
 * no row exists yet. `homeTimezone` comes back too: "current" is undefined
 * without it, and the client uses it to notice a period rollover.
 */
export async function getCurrentJournalSlots(
  userId: string,
  periodTypes: readonly JournalPeriodType[],
): Promise<CurrentJournalSlots> {
  const preferences = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
    columns: { homeTimezone: true },
  });
  if (!preferences?.homeTimezone) return { homeTimezone: null, slots: [] };

  const periods = currentJournalPeriods(
    todayInTimezone(preferences.homeTimezone),
    periodTypes,
  );
  if (periods.length === 0) {
    return { homeTimezone: preferences.homeTimezone, slots: [] };
  }

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
      ),
    );

  const byKey = new Map(
    rows.map((row) => [`${row.periodType}:${row.periodStart}`, row]),
  );
  return {
    homeTimezone: preferences.homeTimezone,
    slots: periods.map((period) => {
      const row = byKey.get(`${period.periodType}:${period.periodStart}`);
      return {
        periodType: period.periodType,
        periodStart: period.periodStart,
        entry: row ? serializeEntry(row) : null,
      };
    }),
  };
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
