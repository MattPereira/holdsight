import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentJournalEntries,
  userPreferences,
} from "@/db/schema/investment-journal";
import {
  canonicalPeriodStart,
  isCalendarDate,
  isJournalPeriodType,
  type JournalPeriodType,
} from "@/lib/investment-journal/periods";

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
  };
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
      message: "Plan and Reflection are limited to 10,000 characters each.",
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
