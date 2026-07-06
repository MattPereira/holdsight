export const JOURNAL_PERIOD_TYPES = ["daily", "weekly", "monthly"] as const;

export type JournalPeriodType = (typeof JOURNAL_PERIOD_TYPES)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isJournalPeriodType(value: string): value is JournalPeriodType {
  return JOURNAL_PERIOD_TYPES.some((periodType) => periodType === value);
}

export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function toUtcDate(calendarDate: string): Date {
  return new Date(`${calendarDate}T12:00:00Z`);
}

function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function canonicalPeriodStart(
  periodType: JournalPeriodType,
  calendarDate: string,
): string {
  if (!isCalendarDate(calendarDate)) return calendarDate;
  if (periodType === "daily") return calendarDate;

  const date = toUtcDate(calendarDate);
  if (periodType === "weekly") {
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  } else {
    date.setUTCDate(1);
  }
  return formatCalendarDate(date);
}

export function moveJournalPeriod(
  periodType: JournalPeriodType,
  periodStart: string,
  amount: number,
): string {
  const date = toUtcDate(canonicalPeriodStart(periodType, periodStart));
  if (periodType === "daily") {
    date.setUTCDate(date.getUTCDate() + amount);
  } else if (periodType === "weekly") {
    date.setUTCDate(date.getUTCDate() + amount * 7);
  } else {
    date.setUTCMonth(date.getUTCMonth() + amount, 1);
  }
  return formatCalendarDate(date);
}
